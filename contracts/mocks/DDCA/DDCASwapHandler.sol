// SPDX-License-Identifier: MIT

pragma solidity 0.7.0;

import '../../DDCA/DDCASwapHandler.sol';
import './DDCAProtocolParameters.sol';

contract DDCASwapHandlerMock is DDCASwapHandler, DDCAProtocolParametersMock {
  constructor(
    IERC20 _from,
    IERC20 _to,
    IUniswapV2Router02 _uniswap
  ) DDCAProtocolParametersMock(_from, _to, _uniswap) {
    /* */
  }

  // SwapHandler
  function swap() public override {
    _swap();
  }

  function uniswapSwap(uint256 _amount) public {
    _uniswapSwap(_amount);
  }
}
