// SPDX-License-Identifier: BUSL-1.1
pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';
import '@chainlink/contracts/src/v0.8/Denominations.sol';
import '../interfaces/oracles/IChainlinkOracle.sol';
import '../libraries/TokenSorting.sol';
import '../utils/Governable.sol';

contract ChainlinkOracle is Governable, IChainlinkOracle {
  /// @inheritdoc IChainlinkOracle
  mapping(address => mapping(address => PricingPlan)) public planForPair;
  /// @inheritdoc IChainlinkOracle
  FeedRegistryInterface public immutable registry;
  /// @inheritdoc IChainlinkOracle
  // solhint-disable-next-line var-name-mixedcase
  address public immutable WETH;
  /// @inheritdoc IChainlinkOracle
  uint32 public immutable maxDelay;

  // solhint-disable private-vars-leading-underscore
  // Addresses in Ethereum Mainnet
  address private constant DAI = 0x6B175474E89094C44Da98b954EedeAC495271d0F;
  address private constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
  address private constant USDT = 0xdAC17F958D2ee523a2206206994597C13D831ec7;
  address private constant RENBTC = 0xEB4C2781e4ebA804CE9a9803C67d0893436bB27D;
  address private constant WBTC = 0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599;
  int8 private constant USD_DECIMALS = 8;
  int8 private constant ETH_DECIMALS = 18;
  // solhint-enable private-vars-leading-underscore

  mapping(address => bool) internal _shouldBeConsideredUSD;
  mapping(address => address) internal _tokenMappings;

  constructor(
    // solhint-disable-next-line var-name-mixedcase
    address _WETH,
    FeedRegistryInterface _registry,
    uint32 _maxDelay,
    address _governor
  ) Governable(_governor) {
    if (_WETH == address(0) || address(_registry) == address(0)) revert ZeroAddress();
    if (_maxDelay == 0) revert ZeroMaxDelay();
    registry = _registry;
    maxDelay = _maxDelay;
    WETH = _WETH;
  }

  /// @inheritdoc IPriceOracle
  function canSupportPair(address _tokenA, address _tokenB) external view returns (bool) {
    (address __tokenA, address __tokenB) = TokenSorting.sortTokens(_tokenA, _tokenB);
    PricingPlan _plan = _determinePricingPlan(__tokenA, __tokenB);
    return _plan != PricingPlan.NONE;
  }

  /// @inheritdoc IPriceOracle
  function quote(
    address _tokenIn,
    uint128 _amountIn,
    address _tokenOut
  ) external view returns (uint256 _amountOut) {
    (address _tokenA, address _tokenB) = TokenSorting.sortTokens(_tokenIn, _tokenOut);
    PricingPlan _plan = planForPair[_tokenA][_tokenB];
    if (_plan == PricingPlan.NONE) revert PairNotSupported();

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

  /// @inheritdoc IPriceOracle
  function reconfigureSupportForPair(address _tokenA, address _tokenB) external {
    _addSupportForPair(_tokenA, _tokenB);
  }

  /// @inheritdoc IPriceOracle
  function addSupportForPairIfNeeded(address _tokenA, address _tokenB) external {
    (address __tokenA, address __tokenB) = TokenSorting.sortTokens(_tokenA, _tokenB);
    if (planForPair[__tokenA][__tokenB] == PricingPlan.NONE) {
      _addSupportForPair(_tokenA, _tokenB);
    }
  }

  function _addSupportForPair(address _tokenA, address _tokenB) internal virtual {
    (address __tokenA, address __tokenB) = TokenSorting.sortTokens(_tokenA, _tokenB);
    PricingPlan _plan = _determinePricingPlan(__tokenA, __tokenB);
    if (_plan == PricingPlan.NONE) revert PairNotSupported();
    planForPair[__tokenA][__tokenB] = _plan;
    emit AddedSupportForPairInChainlinkOracle(__tokenA, __tokenB);
  }

  /// @inheritdoc IChainlinkOracle
  function addUSDStablecoins(address[] calldata _addresses) external onlyGovernor {
    for (uint256 i; i < _addresses.length; i++) {
      _shouldBeConsideredUSD[_addresses[i]] = true;
    }
    emit TokensConsideredUSD(_addresses);
  }

  /// @inheritdoc IChainlinkOracle
  function addMappings(address[] calldata _addresses, address[] calldata _mappings) external onlyGovernor {
    if (_addresses.length != _mappings.length) revert InvalidMappingsInput();
    for (uint256 i; i < _addresses.length; i++) {
      _tokenMappings[_addresses[i]] = _mappings[i];
    }
    emit MappingsAdded(_addresses, _mappings);
  }

  /// @inheritdoc IChainlinkOracle
  function mappedToken(address _token) public view returns (address) {
    if (block.chainid == 1 && (_token == RENBTC || _token == WBTC)) {
      return Denominations.BTC;
    } else {
      address _mapping = _tokenMappings[_token];
      return _mapping != address(0) ? _mapping : _token;
    }
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
      _price = _getETHUSD();
    } else if (_plan == PricingPlan.TOKEN_USD_PAIR) {
      _price = _getPriceAgainstUSD(_isUSD(_tokenOut) ? _tokenIn : _tokenOut);
    } else if (_plan == PricingPlan.TOKEN_ETH_PAIR) {
      _price = _getPriceAgainstETH(_tokenOut == WETH ? _tokenIn : _tokenOut);
    }
    if (!_needsInverting) {
      return _adjustDecimals(_price * _amountIn, _outDecimals - _resultDecimals - _inDecimals);
    } else {
      return _adjustDecimals(_adjustDecimals(_amountIn, _resultDecimals + _outDecimals) / _price, -_inDecimals);
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
    uint256 _tokenInToBase = _callRegistry(mappedToken(_tokenIn), _base);
    uint256 _tokenOutToBase = _callRegistry(mappedToken(_tokenOut), _base);
    return _adjustDecimals((_amountIn * _tokenInToBase) / _tokenOutToBase, _outDecimals - _inDecimals);
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
    uint256 _ethToUSDPrice = _getETHUSD();
    if (_isTokenInUSD) {
      uint256 _tokenInToUSD = _getPriceAgainstUSD(_tokenIn);
      uint256 _tokenOutToETH = _getPriceAgainstETH(_tokenOut);
      uint256 _adjustedInUSDValue = _adjustDecimals(_amountIn * _tokenInToUSD, _outDecimals - _inDecimals + ETH_DECIMALS);
      return _adjustedInUSDValue / _ethToUSDPrice / _tokenOutToETH;
    } else {
      uint256 _tokenInToETH = _getPriceAgainstETH(_tokenIn);
      uint256 _tokenOutToUSD = _getPriceAgainstUSD(_tokenOut);
      return _adjustDecimals((_amountIn * _tokenInToETH * _ethToUSDPrice) / _tokenOutToUSD, _outDecimals - _inDecimals - ETH_DECIMALS);
    }
  }

  function _getPriceAgainstUSD(address _token) internal view returns (uint256) {
    return _isUSD(_token) ? 1e8 : _callRegistry(mappedToken(_token), Denominations.USD);
  }

  function _getPriceAgainstETH(address _token) internal view returns (uint256) {
    return _token == WETH ? 1e18 : _callRegistry(mappedToken(_token), Denominations.ETH);
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
    try registry.latestRoundData(mappedToken(_base), _quote) returns (uint80, int256 _price, uint256, uint256, uint80) {
      return _price > 0;
    } catch {
      return false;
    }
  }

  function _adjustDecimals(uint256 _amount, int256 _factor) internal pure returns (uint256) {
    if (_factor < 0) {
      return _amount / (10**uint256(-_factor));
    } else {
      return _amount * (10**uint256(_factor));
    }
  }

  function _getDecimals(address _token) internal view returns (int8) {
    return int8(IERC20Metadata(_token).decimals());
  }

  function _callRegistry(address _base, address _quote) internal view returns (uint256) {
    (, int256 _price, , uint256 _updatedAt, ) = registry.latestRoundData(_base, _quote);
    if (_price <= 0) revert InvalidPrice();
    if (maxDelay < block.timestamp && _updatedAt < block.timestamp - maxDelay) revert LastUpdateIsTooOld();
    return uint256(_price);
  }

  function _getETHUSD() internal view returns (uint256) {
    return _callRegistry(Denominations.ETH, Denominations.USD);
  }

  function _isUSD(address _token) internal view returns (bool) {
    // We are doing this, to avoid expensive storage read
    bool _isHardcodedUSDInMainnet = block.chainid == 1 && (_token == DAI || _token == USDC || _token == USDT);
    return _isHardcodedUSDInMainnet || _shouldBeConsideredUSD[_token];
  }
}
