// SPDX-License-Identifier: BUSL-1.1
pragma solidity >=0.5.0 <0.8.0;

import '@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol';
import '@uniswap/v3-periphery/contracts/libraries/OracleLibrary.sol';
import '@uniswap/v3-periphery/contracts/libraries/WeightedOracleLibrary.sol';
import '../interfaces/oracles/IUniswapV3Oracle.sol';
import '../utils/Governable.sol';
import '../libraries/UniswapWeightedOracleLibrary.sol';
import '../libraries/TokenSorting.sol';

contract UniswapV3Oracle is IUniswapV3Oracle, Governable {
  /// @inheritdoc IUniswapV3Oracle
  uint16 public constant override MINIMUM_LIQUIDITY_THRESHOLD = 1;
  /// @inheritdoc IUniswapV3Oracle
  IUniswapV3Factory public immutable override factory;
  /// @inheritdoc IUniswapV3Oracle
  uint16 public immutable override minimumPeriod;
  /// @inheritdoc IUniswapV3Oracle
  uint16 public immutable override maximumPeriod;
  /// @inheritdoc IUniswapV3Oracle
  uint16 public override period;
  /// @inheritdoc IUniswapV3Oracle
  uint8 public override cardinalityPerMinute;
  /// @inheritdoc IUniswapV3Oracle
  uint8 public override minimumCardinalityPerMinute;
  /// @inheritdoc IUniswapV3Oracle
  uint8 public override maximumCardinalityPerMinute;

  uint24[] internal _supportedFeeTiers = [500, 3000, 10000];
  mapping(address => mapping(address => address[])) internal _poolsForPair;

  constructor(
    address _governor,
    IUniswapV3Factory _factory,
    uint8 _cardinalityPerMinute,
    uint8 _minimumCardinalityPerMinute,
    uint8 _maximumCardinalityPerMinute,
    uint16 _period,
    uint16 _minimumPeriod,
    uint16 _maximumPeriod
  ) Governable(_governor) {
    require(address(_factory) != address(0), 'ZeroAddress');
    require(_minimumCardinalityPerMinute > 0 && _minimumCardinalityPerMinute < _maximumCardinalityPerMinute, 'InvalidCPMThreshold');
    require(_cardinalityPerMinute <= _maximumCardinalityPerMinute && _cardinalityPerMinute >= _minimumCardinalityPerMinute, 'CPMOutOfRange');
    require(_minimumPeriod > 0 && _minimumPeriod < _maximumPeriod, 'InvalidPeriodThreshold');
    require(_period <= _maximumPeriod && _period >= _minimumPeriod, 'PeriodOutOfRange');
    factory = _factory;
    cardinalityPerMinute = _cardinalityPerMinute;
    minimumCardinalityPerMinute = _minimumCardinalityPerMinute;
    maximumCardinalityPerMinute = _maximumCardinalityPerMinute;
    period = _period;
    minimumPeriod = _minimumPeriod;
    maximumPeriod = _maximumPeriod;
  }

  /// @inheritdoc IPriceOracle
  function canSupportPair(address _tokenA, address _tokenB) external view override returns (bool) {
    uint24[] memory _feeTiers = _supportedFeeTiers;
    for (uint256 i; i < _feeTiers.length; i++) {
      address _pool = factory.getPool(_tokenA, _tokenB, _feeTiers[i]);
      if (_pool != address(0) && IUniswapV3Pool(_pool).liquidity() >= MINIMUM_LIQUIDITY_THRESHOLD) {
        return true;
      }
    }
    return false;
  }

  /// @inheritdoc IPriceOracle
  function quote(
    address _tokenIn,
    uint128 _amountIn,
    address _tokenOut
  ) external view override returns (uint256 _amountOut) {
    (address __tokenA, address __tokenB) = TokenSorting.sortTokens(_tokenIn, _tokenOut);
    address[] memory _pools = _poolsForPair[__tokenA][__tokenB];
    WeightedOracleLibrary.PeriodObservation[] memory _observations = UniswapWeightedOracleLibrary.consultMany(_pools, period);
    int24 _arithmeticMeanWeightedTick = WeightedOracleLibrary.getArithmeticMeanTickWeightedByLiquidity(_observations);
    _amountOut = OracleLibrary.getQuoteAtTick(_arithmeticMeanWeightedTick, _amountIn, _tokenIn, _tokenOut);
  }

  /// @inheritdoc IPriceOracle
  function reconfigureSupportForPair(address _tokenA, address _tokenB) external override {
    (address __tokenA, address __tokenB) = TokenSorting.sortTokens(_tokenA, _tokenB);
    delete _poolsForPair[__tokenA][__tokenB];
    _addSupportForPair(__tokenA, __tokenB);
  }

  /// @inheritdoc IPriceOracle
  function addSupportForPairIfNeeded(address _tokenA, address _tokenB) external override {
    (address __tokenA, address __tokenB) = TokenSorting.sortTokens(_tokenA, _tokenB);
    if (_poolsForPair[__tokenA][__tokenB].length == 0) {
      _addSupportForPair(__tokenA, __tokenB);
    }
  }

  /// @inheritdoc IUniswapV3Oracle
  function poolsUsedForPair(address _tokenA, address _tokenB) external view override returns (address[] memory _usedPools) {
    (address __tokenA, address __tokenB) = TokenSorting.sortTokens(_tokenA, _tokenB);
    _usedPools = _poolsForPair[__tokenA][__tokenB];
  }

  /// @inheritdoc IUniswapV3Oracle
  function supportedFeeTiers() external view override returns (uint24[] memory _feeTiers) {
    _feeTiers = _supportedFeeTiers;
  }

  /// @inheritdoc IUniswapV3Oracle
  function setPeriod(uint16 _period) external override onlyGovernor {
    require(_period <= maximumPeriod, 'GreaterThanMaximumPeriod');
    require(_period >= minimumPeriod, 'LessThanMinimumPeriod');
    period = _period;
    emit PeriodChanged(_period);
  }

  /// @inheritdoc IUniswapV3Oracle
  function setCardinalityPerMinute(uint8 _cardinalityPerMinute) external override onlyGovernor {
    require(_cardinalityPerMinute <= maximumCardinalityPerMinute, 'GreaterThanMaximumCPM');
    require(_cardinalityPerMinute >= minimumCardinalityPerMinute, 'LessThanMinimumCPM');
    cardinalityPerMinute = _cardinalityPerMinute;
    emit CardinalityPerMinuteChanged(_cardinalityPerMinute);
  }

  /// @inheritdoc IUniswapV3Oracle
  function addFeeTier(uint24 _feeTier) external override onlyGovernor {
    require(factory.feeAmountTickSpacing(_feeTier) > 0, 'InvalidFeeTier');

    uint24[] memory _feeTiers = _supportedFeeTiers;
    for (uint256 i; i < _feeTiers.length; i++) {
      require(_feeTiers[i] != _feeTier, 'FeeTierAlreadyPresent');
    }
    _supportedFeeTiers.push(_feeTier);

    emit AddedFeeTier(_feeTier);
  }

  function _addSupportForPair(address _tokenA, address _tokenB) internal virtual {
    uint16 _cardinality = uint16((period * cardinalityPerMinute) / 60) + 10;
    address[] storage _pools = _poolsForPair[_tokenA][_tokenB];
    uint24[] memory _feeTiers = _supportedFeeTiers;
    for (uint256 i; i < _feeTiers.length; i++) {
      address _pool = factory.getPool(_tokenA, _tokenB, _feeTiers[i]);
      if (_pool != address(0) && IUniswapV3Pool(_pool).liquidity() >= MINIMUM_LIQUIDITY_THRESHOLD) {
        _pools.push(_pool);
        IUniswapV3Pool(_pool).increaseObservationCardinalityNext(_cardinality);
      }
    }
    require(_pools.length > 0, 'PairNotSupported');
    emit AddedSupportForPairInUniswapOracle(_tokenA, _tokenB);
  }
}
