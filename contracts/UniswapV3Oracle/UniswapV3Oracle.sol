// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.4;

import '@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol';
import '@openzeppelin/contracts/utils/structs/EnumerableSet.sol';
import '../interfaces/ITimeWeightedOracle.sol';
import '../utils/Governable.sol';
import '../libraries/CommonErrors.sol';

contract UniswapV3Oracle is IUniswapV3OracleAggregator, Governable {
  using EnumerableSet for EnumerableSet.UintSet;
  using EnumerableSet for EnumerableSet.AddressSet;

  uint16 public constant override MINIMUM_PERIOD = 1 minutes;
  uint16 public constant override MAXIMUM_PERIOD = 20 minutes;
  uint8 private constant _AVERAGE_BLOCK_INTERVAL = 15 seconds;
  IUniswapV3Factory public immutable override factory;
  uint16 public override period = 5 minutes;
  EnumerableSet.UintSet internal _supportedFeeTiers;
  mapping(address => mapping(address => EnumerableSet.AddressSet)) internal _poolsForPair;

  constructor(address _governor, IUniswapV3Factory _factory) Governable(_governor) {
    if (address(_factory) == address(0)) revert CommonErrors.ZeroAddress();
    factory = _factory;
  }

  function canSupportPair(address _tokenA, address _tokenB) external view override returns (bool) {
    uint256 _length = _supportedFeeTiers.length();
    for (uint256 i; i < _length; i++) {
      if (factory.getPool(_tokenA, _tokenB, uint24(_supportedFeeTiers.at(i))) != address(0)) {
        return true;
      }
    }
    return false;
  }

  function quote(
    address,
    uint256,
    address
  ) external view override returns (uint256 _amountOut) {
    // TODO
    _amountOut = 0;
  }

  /**
   * This function will take a pair and make sure that all Uniswap V3 pools for the pair are properly initialized for future use.
   * It will also add all available pools to an internal list, to avoid future queries to the factory.
   * It can be called multiple times for the same pair of tokens, to include and re-configure new pools that might appear in the future.
   * Will revert if there are no pools available for the given pair of tokens.
   */
  function addSupportForPair(address _tokenA, address _tokenB) external override {
    uint256 _length = _supportedFeeTiers.length();
    (address __tokenA, address __tokenB) = _sortTokens(_tokenA, _tokenB);
    EnumerableSet.AddressSet storage _pools = _poolsForPair[__tokenA][__tokenB];
    uint16 _cardinality = uint16(period / _AVERAGE_BLOCK_INTERVAL) + 10; // We add 10 just to be on the safe side
    for (uint256 i; i < _length; i++) {
      address _pool = factory.getPool(_tokenA, _tokenB, uint24(_supportedFeeTiers.at(i)));
      if (_pool != address(0) && !_pools.contains(_pool)) {
        _pools.add(_pool);
        IUniswapV3Pool(_pool).increaseObservationCardinalityNext(_cardinality);
      }
    }
    if (_pools.length() == 0) {
      revert PairNotSupported();
    }
    emit AddedSupportForPair(__tokenA, __tokenB);
  }

  function supportedFeeTiers() external view override returns (uint24[] memory _feeTiers) {
    uint256 _length = _supportedFeeTiers.length();
    _feeTiers = new uint24[](_length);
    for (uint256 i; i < _length; i++) {
      _feeTiers[i] = uint24(_supportedFeeTiers.at(i));
    }
  }

  function setPeriod(uint16 _period) external override onlyGovernor {
    if (_period > MAXIMUM_PERIOD) {
      revert GreaterThanMaximumPeriod();
    } else if (_period < MINIMUM_PERIOD) {
      revert LessThanMinimumPeriod();
    }
    period = _period;
    emit PeriodChanged(_period);
  }

  function addFeeTier(uint24 _feeTier) external override onlyGovernor {
    if (factory.feeAmountTickSpacing(_feeTier) == 0) revert InvalidFeeTier();

    _supportedFeeTiers.add(_feeTier);

    emit AddedFeeTier(_feeTier);
  }

  function _sortTokens(address _tokenA, address _tokenB) internal pure returns (address __tokenA, address __tokenB) {
    (__tokenA, __tokenB) = _tokenA < _tokenB ? (_tokenA, _tokenB) : (_tokenB, _tokenA);
  }
}
