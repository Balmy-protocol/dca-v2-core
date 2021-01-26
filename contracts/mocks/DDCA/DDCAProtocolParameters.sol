// SPDX-License-Identifier: MIT

pragma solidity 0.7.0;

import '../../DDCA/DDCAProtocolParameters.sol';

contract DDCAProtocolParametersMock is DDCAProtocolParameters {
  constructor(
    address _feeRecipient,
    IERC20 _from,
    IERC20 _to,
    IUniswapV2Router02 _uniswap
  ) DDCAProtocolParameters(_feeRecipient, _from, _to, _uniswap) {
    /* */
  }

  function setFeeRecipient(address _feeRecipient) public override {
    _setFeeRecipient(_feeRecipient);
  }

  function setFrom(IERC20 _from) public override {
    _setFrom(_from);
  }

  function setTo(IERC20 _from) public override {
    _setTo(_from);
  }

  function setUniswap(IUniswapV2Router02 _uniswap) public override {
    _setUniswap(_uniswap);
  }

  // Mocks setters
  function setSwapAmountDelta(uint256 _swap, int256 _delta) public {
    swapAmountDelta[_swap] = _delta;
  }

  function setAverageRatesPerUnit(
    uint256 _swap,
    uint256[2] memory _averageRatePerUnit
  ) public {
    averageRatesPerUnit[_swap] = _averageRatePerUnit;
  }
}
