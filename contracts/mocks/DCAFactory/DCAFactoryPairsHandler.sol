// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.4;

import '../../DCAFactory/DCAFactoryPairsHandler.sol';

contract DCAFactoryPairsHandlerMock is DCAFactoryPairsHandler {
  constructor(IDCAGlobalParameters _globalParameters) DCAFactoryPairsHandler(_globalParameters) {}

  function sortTokens(address _tokenA, address _tokenB) public pure returns (address __tokenA, address __tokenB) {
    (__tokenA, __tokenB) = _sortTokens(_tokenA, _tokenB);
  }
}
