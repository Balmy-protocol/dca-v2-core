// SPDX-License-Identifier: MIT

pragma solidity 0.7.0;

import '../../DCAFactory/DCAFactoryParameters.sol';

contract DCAFactoryParametersMock is DCAFactoryParameters {
  constructor(address _feeRecipient, IUniswapV2Router02 _uniswap) DCAFactoryParameters(_feeRecipient, _uniswap) {}

  function setFeeRecipient(address _feeRecipient) public override {
    _setFeeRecipient(_feeRecipient);
  }

  function setUniswap(IUniswapV2Router02 _uniswap) public override {
    _setUniswap(_uniswap);
  }

  function addSwapIntervalsToAllowedList(uint256[] calldata _swapIntervals) public override {
    _addSwapIntervalsToAllowedList(_swapIntervals);
  }

  function removeSwapIntervalsFromAllowedList(uint256[] calldata _swapIntervals) public override {
    _removeSwapIntervalsFromAllowedList(_swapIntervals);
  }
}
