// SPDX-License-Identifier: BUSL-1.1
pragma solidity >=0.5.0 <0.8.0;

import '@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol';
import '@uniswap/v3-periphery/contracts/libraries/OracleLibrary.sol';
import '../libraries/EnumerableSet.sol';
import '../interfaces/ITimeWeightedOracle.sol';
import '../utils/Governable.sol';
import '../libraries/WeightedOracleLibrary.sol';

contract UniswapV3Oracle is IUniswapV3OracleAggregator, Governable {
  using EnumerableSet for EnumerableSet.UintSet;
  using EnumerableSet for EnumerableSet.AddressSet;

  uint16 public constant override MINIMUM_PERIOD = 1 minutes;
  uint16 public constant override MAXIMUM_PERIOD = 20 minutes;
  uint16 public constant override MINIMUM_LIQUIDITY_THRESHOLD = 1;
  uint8 private constant _AVERAGE_BLOCK_INTERVAL = 15 seconds;
  IUniswapV3Factory public immutable override factory;
  uint16 public override period = 5 minutes;
  EnumerableSet.UintSet internal _supportedFeeTiers;
  mapping(address => mapping(address => EnumerableSet.AddressSet)) internal _poolsForPair;

  constructor(address _governor, IUniswapV3Factory _factory) Governable(_governor) {
    require(address(_factory) != address(0), 'ZeroAddress');
    factory = _factory;
  }

  function canSupportPair(address _tokenA, address _tokenB) external view override returns (bool) {
    uint256 _length = _supportedFeeTiers.length();
    for (uint256 i; i < _length; i++) {
      address _pool = factory.getPool(_tokenA, _tokenB, uint24(_supportedFeeTiers.at(i)));
      if (_pool != address(0)) {
        return IUniswapV3Pool(_pool).liquidity() >= MINIMUM_LIQUIDITY_THRESHOLD;
      }
    }
    return false;
  }

  function quote(
    address _tokenIn,
    uint128 _amountIn,
    address _tokenOut
  ) external view override returns (uint256 _amountOut) {
    (address __tokenA, address __tokenB) = _sortTokens(_tokenIn, _tokenOut);
    EnumerableSet.AddressSet storage _pools = _poolsForPair[__tokenA][__tokenB];
    uint256 _length = _pools.length();
    WeightedOracleLibrary.PeriodObservation[] memory _observations = new WeightedOracleLibrary.PeriodObservation[](_length);
    for (uint256 i; i < _length; i++) {
      _observations[i] = WeightedOracleLibrary.consult(_pools.at(i), period);
    }
    int24 _arithmeticMeanWeightedTick = WeightedOracleLibrary.getArithmeticMeanTickWeightedByLiquidity(_observations);
    _amountOut = OracleLibrary.getQuoteAtTick(_arithmeticMeanWeightedTick, _amountIn, _tokenIn, _tokenOut);
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
      address _pool = factory.getPool(__tokenA, __tokenB, uint24(_supportedFeeTiers.at(i)));
      if (_pool != address(0) && !_pools.contains(_pool) && IUniswapV3Pool(_pool).liquidity() >= MINIMUM_LIQUIDITY_THRESHOLD) {
        _pools.add(_pool);
        IUniswapV3Pool(_pool).increaseObservationCardinalityNext(_cardinality);
      }
    }
    require(_pools.length() > 0, 'PairNotSupported');
    emit AddedSupportForPair(__tokenA, __tokenB);
  }

  function poolsUsedForPair(address _tokenA, address _tokenB) external view override returns (address[] memory _usedPools) {
    (address __tokenA, address __tokenB) = _sortTokens(_tokenA, _tokenB);
    EnumerableSet.AddressSet storage _pools = _poolsForPair[__tokenA][__tokenB];
    uint256 _length = _pools.length();
    _usedPools = new address[](_length);
    for (uint256 i; i < _length; i++) {
      _usedPools[i] = _pools.at(i);
    }
  }

  function supportedFeeTiers() external view override returns (uint24[] memory _feeTiers) {
    uint256 _length = _supportedFeeTiers.length();
    _feeTiers = new uint24[](_length);
    for (uint256 i; i < _length; i++) {
      _feeTiers[i] = uint24(_supportedFeeTiers.at(i));
    }
  }

  function setPeriod(uint16 _period) external override onlyGovernor {
    require(_period <= MAXIMUM_PERIOD, 'GreaterThanMaximumPeriod');
    require(_period >= MINIMUM_PERIOD, 'LessThanMinimumPeriod');
    period = _period;
    emit PeriodChanged(_period);
  }

  function addFeeTier(uint24 _feeTier) external override onlyGovernor {
    require(factory.feeAmountTickSpacing(_feeTier) > 0, 'InvalidFeeTier');

    _supportedFeeTiers.add(_feeTier);

    emit AddedFeeTier(_feeTier);
  }

  function _sortTokens(address _tokenA, address _tokenB) internal pure returns (address __tokenA, address __tokenB) {
    (__tokenA, __tokenB) = _tokenA < _tokenB ? (_tokenA, _tokenB) : (_tokenB, _tokenA);
  }
}
