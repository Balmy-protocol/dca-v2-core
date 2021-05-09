// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

import './DCAFactoryParameters.sol';
import './DCAFactoryPairsHandler.sol';

interface IDCAFactory is IDCAFactoryParameters, IDCAFactoryPairsHandler {}

contract DCAFactory is DCAFactoryParameters, DCAFactoryPairsHandler, IDCAFactory {
  constructor(address _feeRecipient) DCAFactoryParameters(_feeRecipient) {}

  function createPair(
    address _tokenA,
    address _tokenB,
    uint256 _swapInterval
  ) external override returns (address _pair) {
    _pair = _createPair(_tokenA, _tokenB, _swapInterval);
  }

  function setFeeRecipient(address _feeRecipient) public override {
    // TODO: Only governance
    _setFeeRecipient(_feeRecipient);
  }

  function setFee(uint256 _fee) public override {
    // TODO: Only governance
    _setFee(_fee);
  }

  function addSwapIntervalsToAllowedList(uint256[] calldata _swapIntervals) public override {
    // TODO: Only governance
    _addSwapIntervalsToAllowedList(_swapIntervals);
  }

  function removeSwapIntervalsFromAllowedList(uint256[] calldata _swapIntervals) public override {
    // TODO: Only governance
    _removeSwapIntervalsFromAllowedList(_swapIntervals);
  }
}
