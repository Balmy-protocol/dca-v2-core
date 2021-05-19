// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

import '../utils/Governable.sol';

import './DCAFactoryParameters.sol';
import './DCAFactoryPairsHandler.sol';

interface IDCAFactory is IDCAFactoryParameters, IDCAFactoryPairsHandler {}

contract DCAFactory is DCAFactoryParameters, DCAFactoryPairsHandler, IDCAFactory, Governable {
  constructor(address _governor, address _feeRecipient) DCAFactoryParameters(_feeRecipient) Governable(_governor) {}

  function createPair(
    address _tokenA,
    address _tokenB,
    uint32 _swapInterval
  ) external override returns (address _pair) {
    _pair = _createPair(_tokenA, _tokenB, _swapInterval);
  }

  function setFeeRecipient(address _feeRecipient) public override onlyGovernor {
    _setFeeRecipient(_feeRecipient);
  }

  function setFee(uint32 _fee) public override onlyGovernor {
    _setFee(_fee);
  }

  function addSwapIntervalsToAllowedList(uint32[] calldata _swapIntervals) public override onlyGovernor {
    _addSwapIntervalsToAllowedList(_swapIntervals);
  }

  function removeSwapIntervalsFromAllowedList(uint32[] calldata _swapIntervals) public override onlyGovernor {
    _removeSwapIntervalsFromAllowedList(_swapIntervals);
  }
}
