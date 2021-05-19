// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import '../../DCAFactory/DCAFactoryParameters.sol';

contract DCAFactoryParametersMock is DCAFactoryParameters {
  constructor(address _governor, address _feeRecipient) DCAFactoryParameters(_governor, _feeRecipient) {}
}
