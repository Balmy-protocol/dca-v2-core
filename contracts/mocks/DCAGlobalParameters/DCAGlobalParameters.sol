// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.4;

import '../../DCAGlobalParameters/DCAGlobalParameters.sol';

contract DCAGlobalParametersMock is DCAGlobalParameters {
  constructor(
    address _governor,
    address _feeRecipient,
    IDCATokenDescriptor _nftDescriptor,
    ITimeWeightedOracle _oracle
  ) DCAGlobalParameters(_governor, _feeRecipient, _nftDescriptor, _oracle) {}
}
