// SPDX-License-Identifier: BUSL-1.1
pragma solidity >=0.5.0 <0.8.0;

import '@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol';
import '@uniswap/v3-periphery/contracts/libraries/OracleLibrary.sol';
import '@uniswap/v3-periphery/contracts/libraries/WeightedOracleLibrary.sol';
import '../interfaces/oracles/IUniswapV3Oracle.sol';
import '../utils/Governable.sol';
import '../libraries/UniswapWeightedOracleLibrary.sol';

contract UniswapV3Oracle is IUniswapV3Oracle, Governable {
  uint16 public constant override MINIMUM_PERIOD = 1 minutes;
  uint16 public constant override MAXIMUM_PERIOD = 20 minutes;
  uint16 public constant override MINIMUM_LIQUIDITY_THRESHOLD = 1;
  uint8 private constant _AVERAGE_BLOCK_INTERVAL = 15 seconds;
  IUniswapV3Factory public immutable override factory;
  uint16 public override period = 5 minutes;
  uint24[] internal _supportedFeeTiers = [500, 3000, 10000];
  mapping(address => mapping(address => address[])) internal _poolsForPair;

  constructor(address _governor, IUniswapV3Factory _factory) Governable(_governor) {
    require(address(_factory) != address(0), 'ZeroAddress');
    factory = _factory;
  }

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

  function quote(
    address _tokenIn,
    uint128 _amountIn,
    address _tokenOut
  ) external view override returns (uint256 _amountOut) {
    (address __tokenA, address __tokenB) = _sortTokens(_tokenIn, _tokenOut);
    address[] memory _pools = _poolsForPair[__tokenA][__tokenB];
    WeightedOracleLibrary.PeriodObservation[] memory _observations = UniswapWeightedOracleLibrary.consultMany(_pools, period);
    int24 _arithmeticMeanWeightedTick = WeightedOracleLibrary.getArithmeticMeanTickWeightedByLiquidity(_observations);
    _amountOut = OracleLibrary.getQuoteAtTick(_arithmeticMeanWeightedTick, _amountIn, _tokenIn, _tokenOut);
  }

  function reconfigureSupportForPair(address _tokenA, address _tokenB) external override {
    (address __tokenA, address __tokenB) = _sortTokens(_tokenA, _tokenB);
    delete _poolsForPair[__tokenA][__tokenB];
    _addSupportForPair(__tokenA, __tokenB);
  }

  function addSupportForPairIfNeeded(address _tokenA, address _tokenB) external override {
    (address __tokenA, address __tokenB) = _sortTokens(_tokenA, _tokenB);
    if (_poolsForPair[__tokenA][__tokenB].length == 0) {
      _addSupportForPair(__tokenA, __tokenB);
    }
  }

  function poolsUsedForPair(address _tokenA, address _tokenB) external view override returns (address[] memory _usedPools) {
    (address __tokenA, address __tokenB) = _sortTokens(_tokenA, _tokenB);
    _usedPools = _poolsForPair[__tokenA][__tokenB];
  }

  function supportedFeeTiers() external view override returns (uint24[] memory _feeTiers) {
    _feeTiers = _supportedFeeTiers;
  }

  function setPeriod(uint16 _period) external override onlyGovernor {
    require(_period <= MAXIMUM_PERIOD, 'GreaterThanMaximumPeriod');
    require(_period >= MINIMUM_PERIOD, 'LessThanMinimumPeriod');
    period = _period;
    emit PeriodChanged(_period);
  }

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
    uint16 _cardinality = uint16(period / _AVERAGE_BLOCK_INTERVAL) + 10; // We add 10 just to be on the safe side
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
    // TODO: rename this event so that it is clear that it is emmited by the uniswap v3 oracle
    emit AddedSupportForPair(_tokenA, _tokenB);
  }

  function _sortTokens(address _tokenA, address _tokenB) internal pure returns (address __tokenA, address __tokenB) {
    (__tokenA, __tokenB) = _tokenA < _tokenB ? (_tokenA, _tokenB) : (_tokenB, _tokenA);
  }
}
