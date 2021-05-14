// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

import './DCAFactoryPairsHandler.sol';

contract DCAFactoryMock is DCAFactoryPairsHandlerMock, IDCAFactory {
  constructor(address _feeRecipient) DCAFactoryPairsHandlerMock(_feeRecipient) {}
}
