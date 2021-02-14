// SPDX-License-Identifier: MIT

pragma solidity 0.7.0;

import "../../DCA/DCASwapHandler.sol";
import "./DCAProtocolParameters.sol";

contract DCASwapHandlerMock is DCASwapHandler, DCAProtocolParametersMock {
  constructor(
    address _feeRecipient,
    IERC20Decimals _from,
    IERC20Decimals _to,
    IUniswapV2Router02 _uniswap,
    uint256 _swapInterval
  ) DCAProtocolParametersMock(_feeRecipient, _from, _to, _uniswap) DCASwapHandler(_swapInterval) {
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
