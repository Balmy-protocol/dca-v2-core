// SPDX-License-Identifier: MIT

pragma solidity 0.7.0;

import '../../DDCA/DDCASwapHandler.sol';
import './DDCAProtocolParameters.sol';

contract DDCASwapHandlerMock is DDCASwapHandler, DDCAProtocolParametersMock {
  constructor(
    address _feeRecipient,
    IERC20 _from,
    IERC20 _to,
    IUniswapV2Router02 _uniswap,
    uint256 _swapInterval
  )
    DDCAProtocolParametersMock(_feeRecipient, _from, _to, _uniswap)
    DDCASwapHandler(_swapInterval)
  {
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
