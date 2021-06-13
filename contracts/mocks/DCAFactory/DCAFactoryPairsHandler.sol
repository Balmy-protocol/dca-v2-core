// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.4;

import '../../DCAFactory/DCAFactoryPairsHandler.sol';

contract DCAFactoryPairsHandlerMock is DCAFactoryPairsHandler {
  constructor(IDCAGlobalParameters _globalParameters) DCAFactoryPairsHandler(_globalParameters) {}

  // function sortTokens(address _tokenA, address _tokenB) public pure returns (address _token0, address _token1) {
  //   (_token0, _token1) = _sortTokens(_tokenA, _tokenB);
  // }
}
