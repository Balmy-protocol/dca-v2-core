// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.6;

import './DCAFactoryPairsHandler.sol';

contract DCAFactoryMock is DCAFactoryPairsHandlerMock, IDCAFactory {
  constructor(IDCAGlobalParameters _globalParameters) DCAFactoryPairsHandlerMock(_globalParameters) {}
}
