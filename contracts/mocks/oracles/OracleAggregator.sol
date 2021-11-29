// SPDX-License-Identifier: UNLICENSED

pragma solidity >=0.8.7 <0.9.0;

import '../../oracles/OracleAggregator.sol';

contract OracleAggregatorMock is OracleAggregator {
  mapping(address => mapping(address => bool)) public addSupportForPairCalled;

  constructor(
    IPriceOracle _oracle1,
    IPriceOracle _oracle2,
    address _governor
  ) OracleAggregator(_oracle1, _oracle2, _governor) {}

  function internalAddSupportForPair(address _tokenA, address _tokenB) external {
    _addSupportForPair(_tokenA, _tokenB);
  }

  function _addSupportForPair(address _tokenA, address _tokenB) internal override {
    addSupportForPairCalled[_tokenA][_tokenB] = true;
    super._addSupportForPair(_tokenA, _tokenB);
  }
}
