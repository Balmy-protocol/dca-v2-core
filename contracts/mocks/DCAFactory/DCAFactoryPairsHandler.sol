// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import '../../DCAFactory/DCAFactoryPairsHandler.sol';
import './DCAFactoryParameters.sol';

contract DCAFactoryPairsHandlerMock is DCAFactoryParametersMock, DCAFactoryPairsHandler {
  constructor(address _feeRecipient) DCAFactoryParametersMock(_feeRecipient) {}

  function sortTokens(address _tokenA, address _tokenB) public pure returns (address _token0, address _token1) {
    (_token0, _token1) = _sortTokens(_tokenA, _tokenB);
  }

  function createPair(
    address _from,
    address _to,
    uint32 _swapInterval
  ) external override returns (address _pair) {
    _pair = _createPair(_from, _to, _swapInterval);
  }
}
