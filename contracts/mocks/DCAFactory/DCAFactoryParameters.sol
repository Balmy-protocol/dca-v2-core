// SPDX-License-Identifier: MIT

pragma solidity 0.8.0;

import '../../DCAFactory/DCAFactoryParameters.sol';

contract DCAFactoryParametersMock is DCAFactoryParameters {
  constructor(address _feeRecipient) DCAFactoryParameters(_feeRecipient) {}

  function setFee(uint256 _fee) public override {
    _setFee(_fee);
  }

  function setFeeRecipient(address _feeRecipient) public override {
    _setFeeRecipient(_feeRecipient);
  }

  function addSwapIntervalsToAllowedList(uint256[] calldata _swapIntervals) public override {
    _addSwapIntervalsToAllowedList(_swapIntervals);
  }

  function removeSwapIntervalsFromAllowedList(uint256[] calldata _swapIntervals) public override {
    _removeSwapIntervalsFromAllowedList(_swapIntervals);
  }
}
