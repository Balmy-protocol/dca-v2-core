// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import '../../DCAFactory/DCAFactoryPairsHandler.sol';
import './DCAFactoryParameters.sol';

contract DCAFactoryPairsHandlerMock is DCAFactoryParametersMock, DCAFactoryPairsHandler {
  constructor(address _governor, address _feeRecipient) DCAFactoryParametersMock(_governor, _feeRecipient) {}

  function sortTokens(address _tokenA, address _tokenB) public pure returns (address _token0, address _token1) {
    (_token0, _token1) = _sortTokens(_tokenA, _tokenB);
  }
}
