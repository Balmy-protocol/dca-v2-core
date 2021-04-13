//SPDX-License-Identifier: Unlicense
pragma solidity 0.7.0;

import './DCAFactoryParameters.sol';
import './DCAFactoryPairsHandler.sol';

interface IDCAFactory {}

contract DCAFactory is DCAFactoryParameters, DCAFactoryPairsHandler, IDCAFactory {
  constructor(address _feeRecipient) DCAFactoryParameters(_feeRecipient) {}

  function createPair(
    address _from,
    address _to,
    uint256 _swapInterval
  ) external override returns (address _pair) {
    _pair = _createPair(_from, _to, _swapInterval);
  }

  function setFeeRecipient(address _feeRecipient) public override {
    // TODO: Only governance
  }

  function addSwapIntervalsToAllowedList(uint256[] calldata _swapIntervals) public override {
    // TODO: Only governance
  }

  function removeSwapIntervalsFromAllowedList(uint256[] calldata _swapIntervals) public override {
    // TODO: Only governance
  }
}
