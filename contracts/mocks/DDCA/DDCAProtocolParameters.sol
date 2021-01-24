// SPDX-License-Identifier: MIT

pragma solidity 0.7.0;

import '../../DDCA/DDCAProtocolParameters.sol';

contract DDCAProtocolParametersMock is DDCAProtocolParameters {
  constructor(
    IERC20 _from,
    IERC20 _to,
    IUniswapV2Router02 _uniswap
  ) DDCAProtocolParameters(_from, _to, _uniswap) {
    /* */
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
}
