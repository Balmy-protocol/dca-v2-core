// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.4;

import './DCAFactoryPairsHandler.sol';

contract DCAFactory is DCAFactoryPairsHandler, IDCAFactory {
  constructor(IDCAGlobalParameters _globalParameters) DCAFactoryPairsHandler(_globalParameters) {}
}
