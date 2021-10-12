// SPDX-License-Identifier: BUSL-1.1
pragma solidity >=0.5.0 <0.8.0;

import '@chainlink/contracts/src/v0.7/interfaces/FeedRegistryInterface.sol';
import '@chainlink/contracts/src/v0.7/Denominations.sol';

interface IERC20Decimals {
  function decimals() external view returns (uint8);
}

contract ChainlinkOracle {
  // TODO: Move enum and event to interface
  enum PricingPlan {
    NONE,
    TOKEN_A_IS_ETH_TOKEN_B_IS_USD,
    TOKEN_A_IS_USD_TOKEN_B_IS_ETH,
    TOKEN_A_TO_USD,
    TOKEN_B_TO_USD,
    TOKEN_A_TO_ETH,
    TOKEN_B_TO_ETH,
    TOKEN_A_TO_ETH_TO_USD,
    TOKEN_B_TO_ETH_TO_USD,
    TOKEN_A_TO_USD_TO_ETH,
    TOKEN_B_TO_USD_TO_ETH,
    TOKEN_A_TO_USD_TO_TOKEN_B,
    TOKEN_B_TO_USD_TO_TOKEN_A,
    TOKEN_A_TO_ETH_TO_TOKEN_B,
    TOKEN_B_TO_ETH_TO_TOKEN_A,
    TOKEN_A_TO_USD_TO_ETH_TO_TOKEN_B,
    TOKEN_B_TO_USD_TO_ETH_TO_TOKEN_A,
    TOKEN_A_TO_ETH_TO_USD_TO_TOKEN_B,
    TOKEN_B_TO_ETH_TO_USD_TO_TOKEN_A
  }

  event AddedChainlinkSupportForPair(address tokenA, address tokenB);

  FeedRegistryInterface public registry;

  // solhint-disable-next-line var-name-mixedcase
  address public immutable WETH;

  // Addresses in Ethereum Mainnet
  // solhint-disable private-vars-leading-underscore
  address private constant DAI = 0x6B175474E89094C44Da98b954EedeAC495271d0F;
  address private constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
  address private constant USDT = 0xdAC17F958D2ee523a2206206994597C13D831ec7;
  int8 private constant USD_DECIMALS = 8;
  int8 private constant ETH_DECIMALS = 18;
  // solhint-enable private-vars-leading-underscore

  mapping(address => mapping(address => PricingPlan)) public planForPair;

  // solhint-disable-next-line var-name-mixedcase
  constructor(address _WETH, FeedRegistryInterface _registry) {
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

    (uint256 _price, int8 _resultDecimals) = _getPrice(_tokenA, _tokenB, _plan);

    // Determine whether the price plan was from A to B, or B to A
    bool _isPlanFromAToB = uint8(_plan) % 2 == 1;

    int8 _inDecimals = _getDecimals(_tokenIn);
    int8 _outDecimals = _getDecimals(_tokenOut);
    if (_tokenIn == _tokenA && _isPlanFromAToB) {
      _amountOut = _adjustDecimals(_price * _amountIn, _outDecimals - _resultDecimals - _inDecimals);
    } else {
      _amountOut = _adjustDecimals(((10**uint8(_resultDecimals + _outDecimals)) * _amountIn) / _price, -_inDecimals);
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
    emit AddedChainlinkSupportForPair(__tokenA, __tokenB);
  }

  function _determinePricingPlan(address _tokenA, address _tokenB) internal view virtual returns (PricingPlan) {
    bool _isTokenAUSD = _isUSD(_tokenA);
    bool _isTokenBUSD = _isUSD(_tokenB);
    if (_tokenA == WETH && _isTokenBUSD) {
      // Note: there are stablecoins/ETH pairs on Chainlink, but they are updated less often than the USD/ETH pair.
      // That's why we prefer to use the USD/ETH pair instead
      return PricingPlan.TOKEN_A_IS_ETH_TOKEN_B_IS_USD;
    } else if (_isTokenAUSD && _tokenB == WETH) {
      // Note: there are stablecoins/ETH pairs on Chainlink, but they are updated less often than the USD/ETH pair.
      // That's why we prefer to use the USD/ETH pair instead
      return PricingPlan.TOKEN_A_IS_USD_TOKEN_B_IS_ETH;
    } else if (_isTokenBUSD) {
      return PricingPlan.TOKEN_A_TO_USD;
    } else if (_isTokenAUSD) {
      return PricingPlan.TOKEN_B_TO_USD;
    }
    return PricingPlan.NONE;
  }

  function _getPrice(
    address _tokenA,
    address _tokenB,
    PricingPlan _plan
  ) internal view returns (uint256 _price, int8 _resultDecimals) {
    if (_plan == PricingPlan.TOKEN_A_IS_ETH_TOKEN_B_IS_USD) {
      return (_callRegistry(Denominations.ETH, Denominations.USD), USD_DECIMALS);
    } else if (_plan == PricingPlan.TOKEN_A_IS_USD_TOKEN_B_IS_ETH) {
      return (_callRegistry(Denominations.ETH, Denominations.USD), USD_DECIMALS);
    } else if (_plan == PricingPlan.TOKEN_A_TO_USD) {
      return (_callRegistry(_tokenA, Denominations.USD), USD_DECIMALS);
    } else if (_plan == PricingPlan.TOKEN_B_TO_USD) {
      return (_callRegistry(_tokenB, Denominations.USD), USD_DECIMALS);
    }
  }

  function _adjustDecimals(uint256 _amount, int256 _eFactor) internal pure returns (uint256) {
    if (_eFactor < 0) {
      return _amount / 10**uint256(-_eFactor);
    } else {
      return _amount * 10**uint256(_eFactor);
    }
  }

  function _getDecimals(address _token) internal view returns (int8) {
    return int8(IERC20Decimals(_token).decimals());
  }

  function _callRegistry(address _base, address _quote) internal view returns (uint256) {
    return uint256(registry.latestAnswer(_base, _quote));
  }

  function _isUSD(address _token) internal pure returns (bool) {
    return _token == DAI || _token == USDC || _token == USDT;
    // TODO: Add a way so that the governor can add new usd stable coins
  }

  function _sortTokens(address _tokenA, address _tokenB) internal pure returns (address __tokenA, address __tokenB) {
    (__tokenA, __tokenB) = _tokenA < _tokenB ? (_tokenA, _tokenB) : (_tokenB, _tokenA);
  }
}
