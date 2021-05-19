// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import '../../DCAFactory/DCAFactoryParameters.sol';

contract DCAFactoryParametersMock is DCAFactoryParameters {
  constructor(address _feeRecipient) DCAFactoryParameters(_feeRecipient) {}

  function setFee(uint32 _fee) public override {
    _setFee(_fee);
  }

  function setFeeRecipient(address _feeRecipient) public override {
    _setFeeRecipient(_feeRecipient);
  }

  function addSwapIntervalsToAllowedList(uint32[] calldata _swapIntervals) public override {
    _addSwapIntervalsToAllowedList(_swapIntervals);
  }

  function removeSwapIntervalsFromAllowedList(uint32[] calldata _swapIntervals) public override {
    _removeSwapIntervalsFromAllowedList(_swapIntervals);
  }
}
