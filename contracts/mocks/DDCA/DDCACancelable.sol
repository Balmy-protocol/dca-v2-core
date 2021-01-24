// SPDX-License-Identifier: MIT

pragma solidity 0.7.0;

import '../../DDCA/DDCACancelable.sol';
import './DDCAProtocolParameters.sol';

contract DDCACancelableMock is DDCACancelable, DDCAProtocolParametersMock {
  constructor(
    IERC20 _from,
    IERC20 _to,
    IUniswapV2Router02 _uniswap
  ) DDCAProtocolParametersMock(_from, _to, _uniswap) {
    /* */
  }

  // Cancelable
  function cancel() public override {
    _cancel();
  }
}
