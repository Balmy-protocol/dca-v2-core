// SPDX-License-Identifier: MIT

pragma solidity 0.7.0;

import '../../DCAPair/DCAPairSwapHandler.sol';
import './DCAPairParameters.sol';

contract DCAPairSwapHandlerMock is DCAPairSwapHandler, DCAPairParametersMock {
  constructor(
    IERC20Decimals _token0,
    IERC20Decimals _token1,
    IUniswapV2Router02 _uniswap,
    IDCAFactory _factory,
    uint256 _swapInterval
  ) DCAPairParametersMock(_token0, _token1, _uniswap) DCAPairSwapHandler(_factory, _swapInterval) {
    /* */
  }

  // SwapHandler
  function setSwapInterval(uint256 _swapInterval) public override {
    _setSwapInterval(_swapInterval);
  }

  function swap() public override {
    _swap();
  }

  function uniswapSwap(uint256 _amount) public {
    _uniswapSwap(_amount);
  }

  // Mocks setters
  function setSwapAmountAccumulator(uint256 _swapAmountAccumulator) public {
    swapAmountAccumulator = _swapAmountAccumulator;
  }

  function setLastSwapPerformed(uint256 _lastSwapPerformend) public {
    lastSwapPerformed = _lastSwapPerformend;
  }

  function setPerformedSwaps(uint256 _performedSwaps) public {
    performedSwaps = _performedSwaps;
  }
}
