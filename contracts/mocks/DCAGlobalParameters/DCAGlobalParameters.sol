// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.6;

import '../../DCAGlobalParameters/DCAGlobalParameters.sol';

contract DCAGlobalParametersMock is DCAGlobalParameters {
  constructor(
    address _immediateGovernor,
    address _timeLockedGovernor,
    address _feeRecipient,
    IDCATokenDescriptor _nftDescriptor,
    ITimeWeightedOracle _oracle
  ) DCAGlobalParameters(_immediateGovernor, _timeLockedGovernor, _feeRecipient, _nftDescriptor, _oracle) {}
}
