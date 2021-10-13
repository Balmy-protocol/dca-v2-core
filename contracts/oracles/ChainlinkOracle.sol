// SPDX-License-Identifier: BUSL-1.1
pragma solidity >=0.5.0 <0.8.0;

import '@chainlink/contracts/src/v0.7/interfaces/FeedRegistryInterface.sol';
import '@chainlink/contracts/src/v0.7/Denominations.sol';
import '../libraries/SafeMath.sol';
import '../utils/Governable.sol';

interface IERC20Decimals {
  function decimals() external view returns (uint8);
}

contract ChainlinkOracle is Governable {
  // TODO: Move enum and event to interface
  enum PricingPlan {
    NONE,
    // Direct
    ETH_USD_PAIR,
    TOKEN_USD_PAIR,
    TOKEN_ETH_PAIR,
    // Same token base
    TOKEN_TO_USD_TO_TOKEN_PAIR,
    TOKEN_TO_ETH_TO_TOKEN_PAIR,
    // Different token bases
    TOKEN_A_TO_USD_TO_ETH_TO_TOKEN_B,
    TOKEN_A_TO_ETH_TO_USD_TO_TOKEN_B
  }

  using SafeMath for uint256;

  event AddedSupportForPairInChainlinkOracle(address tokenA, address tokenB);
  event TokensConsideredUSD(address[] tokens);

  mapping(address => mapping(address => PricingPlan)) public planForPair;
  FeedRegistryInterface public immutable registry;
  // solhint-disable-next-line var-name-mixedcase
  address public immutable WETH;

  // solhint-disable private-vars-leading-underscore
  // Addresses in Ethereum Mainnet
  address private constant DAI = 0x6B175474E89094C44Da98b954EedeAC495271d0F;
  address private constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
  address private constant USDT = 0xdAC17F958D2ee523a2206206994597C13D831ec7;
  int8 private constant USD_DECIMALS = 8;
  int8 private constant ETH_DECIMALS = 18;
  // solhint-enable private-vars-leading-underscore

  mapping(address => bool) internal _shouldBeConsideredUSD;

  // solhint-disable-next-line var-name-mixedcase
  constructor(
    address _WETH,
    FeedRegistryInterface _registry,
    address _governor
  ) Governable(_governor) {
    require(_WETH != address(0) && address(_registry) != address(0), 'ZeroAddress');
    registry = _registry;
    WETH = _WETH;
  }

  function canSupportPair(address _tokenA, address _tokenB) external view returns (bool) {
    (address __tokenA, address __tokenB) = _sortTokens(_tokenA, _tokenB);
    PricingPlan _plan = _determinePricingPlan(__tokenA, __tokenB);
    return _plan != PricingPlan.NONE;
  }

  function quote(
    address _tokenIn,
    uint128 _amountIn,
    address _tokenOut
  ) external view returns (uint256 _amountOut) {
    (address _tokenA, address _tokenB) = _sortTokens(_tokenIn, _tokenOut);
    PricingPlan _plan = planForPair[_tokenA][_tokenB];
    require(_plan != PricingPlan.NONE, 'Pair not supported');

    int8 _inDecimals = _getDecimals(_tokenIn);
    int8 _outDecimals = _getDecimals(_tokenOut);

    if (_plan <= PricingPlan.TOKEN_ETH_PAIR) {
      return _getDirectPrice(_tokenIn, _tokenOut, _inDecimals, _outDecimals, _amountIn, _plan);
    } else if (_plan <= PricingPlan.TOKEN_TO_ETH_TO_TOKEN_PAIR) {
      return _getPriceSameBase(_tokenIn, _tokenOut, _inDecimals, _outDecimals, _amountIn, _plan);
    } else {
      return _getPriceDifferentBases(_tokenIn, _tokenOut, _inDecimals, _outDecimals, _amountIn, _plan);
    }
  }

  function reconfigureSupportForPair(address _tokenA, address _tokenB) external {
    _addSupportForPair(_tokenA, _tokenB);
  }

  function addSupportForPairIfNeeded(address _tokenA, address _tokenB) external {
    (address __tokenA, address __tokenB) = _sortTokens(_tokenA, _tokenB);
    if (planForPair[__tokenA][__tokenB] == PricingPlan.NONE) {
      _addSupportForPair(_tokenA, _tokenB);
    }
  }

  function _addSupportForPair(address _tokenA, address _tokenB) internal virtual {
    (address __tokenA, address __tokenB) = _sortTokens(_tokenA, _tokenB);
    PricingPlan _plan = _determinePricingPlan(__tokenA, __tokenB);
    require(_plan != PricingPlan.NONE, 'Pair not supported');
    planForPair[__tokenA][__tokenB] = _plan;
    emit AddedSupportForPairInChainlinkOracle(__tokenA, __tokenB);
  }

  function addUSDStablecoins(address[] calldata _addresses) external onlyGovernor {
    for (uint256 i; i < _addresses.length; i++) {
      _shouldBeConsideredUSD[_addresses[i]] = true;
    }
    emit TokensConsideredUSD(_addresses);
  }

  /** Handles prices when the pair is either ETH/USD, token/ETH or token/USD */
  function _getDirectPrice(
    address _tokenIn,
    address _tokenOut,
    int8 _inDecimals,
    int8 _outDecimals,
    uint256 _amountIn,
    PricingPlan _plan
  ) internal view returns (uint256) {
    uint256 _price;
    int8 _resultDecimals = _plan == PricingPlan.TOKEN_ETH_PAIR ? ETH_DECIMALS : USD_DECIMALS;
    bool _needsInverting = _isUSD(_tokenIn) || (_plan == PricingPlan.TOKEN_ETH_PAIR && _tokenIn == WETH);

    if (_plan == PricingPlan.ETH_USD_PAIR) {
      _price = _callRegistry(Denominations.ETH, Denominations.USD);
    } else if (_plan == PricingPlan.TOKEN_USD_PAIR) {
      _price = _getPriceAgainstUSD(_isUSD(_tokenOut) ? _tokenIn : _tokenOut);
    } else if (_plan == PricingPlan.TOKEN_ETH_PAIR) {
      _price = _getPriceAgainstETH(_tokenOut == WETH ? _tokenIn : _tokenOut);
    }
    if (_needsInverting) {
      return _adjustDecimals(_price.mul(_amountIn), _outDecimals - _resultDecimals - _inDecimals);
    } else {
      return _adjustDecimals(_adjustDecimals(_amountIn, _resultDecimals + _outDecimals).div(_price), -_inDecimals);
    }
  }

  /** Handles prices when both tokens share the same base (either ETH or USD) */
  function _getPriceSameBase(
    address _tokenIn,
    address _tokenOut,
    int8 _inDecimals,
    int8 _outDecimals,
    uint256 _amountIn,
    PricingPlan _plan
  ) internal view returns (uint256) {
    address _base = _plan == PricingPlan.TOKEN_TO_USD_TO_TOKEN_PAIR ? Denominations.USD : Denominations.ETH;
    uint256 _tokenInToBase = _callRegistry(_tokenIn, _base);
    uint256 _tokenOutToBase = _callRegistry(_tokenOut, _base);
    return _adjustDecimals(_amountIn.mul(_tokenInToBase).div(_tokenOutToBase), _outDecimals - _inDecimals);
  }

  /** Handles prices when one of the tokens uses ETH as the base, and the other USD */
  function _getPriceDifferentBases(
    address _tokenIn,
    address _tokenOut,
    int8 _inDecimals,
    int8 _outDecimals,
    uint256 _amountIn,
    PricingPlan _plan
  ) internal view returns (uint256) {
    bool _isTokenInUSD = (_plan == PricingPlan.TOKEN_A_TO_USD_TO_ETH_TO_TOKEN_B && _tokenIn < _tokenOut) ||
      (_plan == PricingPlan.TOKEN_A_TO_ETH_TO_USD_TO_TOKEN_B && _tokenIn > _tokenOut);
    uint256 _ethToUSDPrice = _callRegistry(Denominations.ETH, Denominations.USD);
    if (_isTokenInUSD) {
      uint256 _tokenInToUSD = _getPriceAgainstUSD(_tokenIn);
      uint256 _tokenOutToETH = _getPriceAgainstETH(_tokenOut);
      uint256 _adjustedInUSDValue = _adjustDecimals(_amountIn.mul(_tokenInToUSD), _outDecimals - _inDecimals + ETH_DECIMALS);
      return _adjustedInUSDValue.div(_ethToUSDPrice).div(_tokenOutToETH);
    } else {
      uint256 _tokenInToETH = _getPriceAgainstETH(_tokenIn);
      uint256 _tokenOutToUSD = _getPriceAgainstUSD(_tokenOut);
      return _adjustDecimals(_amountIn.mul(_tokenInToETH).mul(_ethToUSDPrice).div(_tokenOutToUSD), _outDecimals - _inDecimals - ETH_DECIMALS);
    }
  }

  function _getPriceAgainstUSD(address _token) internal view returns (uint256) {
    return _isUSD(_token) ? 1e8 : _callRegistry(_token, Denominations.USD);
  }

  function _getPriceAgainstETH(address _token) internal view returns (uint256) {
    return _token == WETH ? 1e18 : _callRegistry(_token, Denominations.ETH);
  }

  function _determinePricingPlan(address _tokenA, address _tokenB) internal view virtual returns (PricingPlan) {
    bool _isTokenAUSD = _isUSD(_tokenA);
    bool _isTokenBUSD = _isUSD(_tokenB);
    bool _isTokenAETH = _tokenA == WETH;
    bool _isTokenBETH = _tokenB == WETH;
    if ((_isTokenAETH && _isTokenBUSD) || (_isTokenAUSD && _isTokenBETH)) {
      // Note: there are stablecoins/ETH pairs on Chainlink, but they are updated less often than the USD/ETH pair.
      // That's why we prefer to use the USD/ETH pair instead
      return PricingPlan.ETH_USD_PAIR;
    } else if (_isTokenBUSD) {
      return _tryWithBases(_tokenA, PricingPlan.TOKEN_USD_PAIR, PricingPlan.TOKEN_A_TO_ETH_TO_USD_TO_TOKEN_B);
    } else if (_isTokenAUSD) {
      return _tryWithBases(_tokenB, PricingPlan.TOKEN_USD_PAIR, PricingPlan.TOKEN_A_TO_USD_TO_ETH_TO_TOKEN_B);
    } else if (_isTokenBETH) {
      return _tryWithBases(_tokenA, PricingPlan.TOKEN_A_TO_USD_TO_ETH_TO_TOKEN_B, PricingPlan.TOKEN_ETH_PAIR);
    } else if (_isTokenAETH) {
      return _tryWithBases(_tokenB, PricingPlan.TOKEN_A_TO_ETH_TO_USD_TO_TOKEN_B, PricingPlan.TOKEN_ETH_PAIR);
    } else if (_exists(_tokenA, Denominations.USD)) {
      return _tryWithBases(_tokenB, PricingPlan.TOKEN_TO_USD_TO_TOKEN_PAIR, PricingPlan.TOKEN_A_TO_USD_TO_ETH_TO_TOKEN_B);
    } else if (_exists(_tokenA, Denominations.ETH)) {
      return _tryWithBases(_tokenB, PricingPlan.TOKEN_A_TO_ETH_TO_USD_TO_TOKEN_B, PricingPlan.TOKEN_TO_ETH_TO_TOKEN_PAIR);
    }
    return PricingPlan.NONE;
  }

  function _tryWithBases(
    address _token,
    PricingPlan _ifUSD,
    PricingPlan _ifETH
  ) internal view returns (PricingPlan) {
    // Note: we are prioritizing plans that have fewer external calls
    (address _firstBase, PricingPlan _firstResult, address _secondBaseBase, PricingPlan _secondResult) = _ifUSD < _ifETH
      ? (Denominations.USD, _ifUSD, Denominations.ETH, _ifETH)
      : (Denominations.ETH, _ifETH, Denominations.USD, _ifUSD);
    if (_exists(_token, _firstBase)) {
      return _firstResult;
    } else if (_exists(_token, _secondBaseBase)) {
      return _secondResult;
    } else {
      return PricingPlan.NONE;
    }
  }

  function _exists(address _base, address _quote) internal view returns (bool) {
    try registry.latestAnswer(_base, _quote) returns (int256) {
      return true;
    } catch {
      return false;
    }
  }

  function _adjustDecimals(uint256 _amount, int256 _factor) internal pure returns (uint256) {
    if (_factor < 0) {
      return _amount.div(10**uint256(-_factor));
    } else {
      return _amount.mul(10**uint256(_factor));
    }
  }

  function _getDecimals(address _token) internal view returns (int8) {
    return int8(IERC20Decimals(_token).decimals());
  }

  function _callRegistry(address _base, address _quote) internal view returns (uint256) {
    return uint256(registry.latestAnswer(_base, _quote));
  }

  // TODO: add mapping from WBTC to BTC

  function _isUSD(address _token) internal view returns (bool) {
    return _token == DAI || _token == USDC || _token == USDT || _shouldBeConsideredUSD[_token];
  }

  function _sortTokens(address _tokenA, address _tokenB) internal pure returns (address __tokenA, address __tokenB) {
    (__tokenA, __tokenB) = _tokenA < _tokenB ? (_tokenA, _tokenB) : (_tokenB, _tokenA);
  }
}
