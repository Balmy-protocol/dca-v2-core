// SPDX-License-Identifier: UNLICENSED

pragma solidity >=0.5.0 <0.8.0;

import '../../oracles/UniswapV3Oracle.sol';

contract UniswapV3OracleMock is UniswapV3Oracle {
  mapping(address => mapping(address => bool)) public addSupportForPairCalled;

  constructor(address _governor, IUniswapV3Factory _factory) UniswapV3Oracle(_governor, _factory) {}

  function internalAddSupportForPair(address _tokenA, address _tokenB) external {
    _addSupportForPair(_tokenA, _tokenB);
  }

  function _addSupportForPair(address _tokenA, address _tokenB) internal override {
    addSupportForPairCalled[_tokenA][_tokenB] = true;
    super._addSupportForPair(_tokenA, _tokenB);
  }

  function reset(address _tokenA, address _tokenB) external {
    delete addSupportForPairCalled[_tokenA][_tokenB];
  }
}
