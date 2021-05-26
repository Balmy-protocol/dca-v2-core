// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

import './DCAFactoryParameters.sol';
import './DCAFactoryPairsHandler.sol';

contract DCAFactory is DCAFactoryParameters, DCAFactoryPairsHandler, IDCAFactory {
  constructor(address _governor, address _feeRecipient) DCAFactoryParameters(_governor, _feeRecipient) {}
}
