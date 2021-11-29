// SPDX-License-Identifier: BUSL-1.1
pragma solidity >=0.8.7 <0.9.0;

import '../interfaces/oracles/IOracleAggregator.sol';
import '../libraries/TokenSorting.sol';
import '../utils/Governable.sol';

contract OracleAggregator is Governable, IOracleAggregator {
  // Note: by default oracle 1 will take precendence over oracle 2
  /// @inheritdoc IOracleAggregator
  IPriceOracle public immutable oracle1;
  /// @inheritdoc IOracleAggregator
  IPriceOracle public immutable oracle2;
  mapping(address => mapping(address => OracleInUse)) internal _oracleInUse;

  constructor(
    IPriceOracle _oracle1,
    IPriceOracle _oracle2,
    address _governor
  ) Governable(_governor) {
    require(address(_oracle1) != address(0) && address(_oracle2) != address(0), 'ZeroAddress');
    oracle1 = _oracle1;
    oracle2 = _oracle2;
  }

  /// @inheritdoc IPriceOracle
  function canSupportPair(address _tokenA, address _tokenB) external view returns (bool) {
    return oracle1.canSupportPair(_tokenA, _tokenB) || oracle2.canSupportPair(_tokenA, _tokenB);
  }

  /// @inheritdoc IPriceOracle
  function quote(
    address _tokenIn,
    uint128 _amountIn,
    address _tokenOut
  ) external view returns (uint256 _amountOut) {
    (address _tokenA, address _tokenB) = TokenSorting.sortTokens(_tokenIn, _tokenOut);
    OracleInUse _inUse = _oracleInUse[_tokenA][_tokenB];
    require(_inUse != OracleInUse.NONE, 'PairNotSupported');
    if (_inUse == OracleInUse.ORACLE_1) {
      return oracle1.quote(_tokenIn, _amountIn, _tokenOut);
    } else {
      return oracle2.quote(_tokenIn, _amountIn, _tokenOut);
    }
  }

  /// @inheritdoc IOracleAggregator
  function oracleInUse(address _tokenA, address _tokenB) external view returns (OracleInUse) {
    (address __tokenA, address __tokenB) = TokenSorting.sortTokens(_tokenA, _tokenB);
    return _oracleInUse[__tokenA][__tokenB];
  }

  /// @inheritdoc IPriceOracle
  function reconfigureSupportForPair(address _tokenA, address _tokenB) external onlyGovernor {
    (address __tokenA, address __tokenB) = TokenSorting.sortTokens(_tokenA, _tokenB);
    _addSupportForPair(__tokenA, __tokenB);
  }

  /// @inheritdoc IPriceOracle
  function addSupportForPairIfNeeded(address _tokenA, address _tokenB) external {
    (address __tokenA, address __tokenB) = TokenSorting.sortTokens(_tokenA, _tokenB);
    if (_oracleInUse[__tokenA][__tokenB] == OracleInUse.NONE) {
      _addSupportForPair(__tokenA, __tokenB);
    }
  }

  /// @inheritdoc IOracleAggregator
  function setOracleForPair(
    address _tokenA,
    address _tokenB,
    OracleInUse _oracle
  ) external onlyGovernor {
    if (_oracle == OracleInUse.ORACLE_1) {
      oracle1.addSupportForPairIfNeeded(_tokenA, _tokenB);
    } else if (_oracle == OracleInUse.ORACLE_2) {
      oracle2.addSupportForPairIfNeeded(_tokenA, _tokenB);
    } else {
      revert InvalidOracle();
    }
    (address __tokenA, address __tokenB) = TokenSorting.sortTokens(_tokenA, _tokenB);
    _setOracleInUse(__tokenA, __tokenB, _oracle);
  }

  function _addSupportForPair(address _tokenA, address _tokenB) internal virtual {
    if (oracle1.canSupportPair(_tokenA, _tokenB)) {
      oracle1.reconfigureSupportForPair(_tokenA, _tokenB);
      _setOracleInUse(_tokenA, _tokenB, OracleInUse.ORACLE_1);
    } else {
      oracle2.reconfigureSupportForPair(_tokenA, _tokenB);
      _setOracleInUse(_tokenA, _tokenB, OracleInUse.ORACLE_2);
    }
  }

  function _setOracleInUse(
    address _tokenA,
    address _tokenB,
    OracleInUse _oracle
  ) internal {
    _oracleInUse[_tokenA][_tokenB] = _oracle;
    emit OracleSetForUse(_tokenA, _tokenB, _oracle);
  }
}
