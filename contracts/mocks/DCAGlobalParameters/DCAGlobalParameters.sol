// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import '../../DCAGlobalParameters/DCAGlobalParameters.sol';

contract DCAGlobalParametersMock is DCAGlobalParameters {
  constructor(address _governor, address _feeRecipient) DCAGlobalParameters(_governor, _feeRecipient) {}
}
