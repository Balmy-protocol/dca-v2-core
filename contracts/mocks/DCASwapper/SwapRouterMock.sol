// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

import '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';
import '../../interfaces/IERC20Detailed.sol';

contract SwapRouterMock {
  uint256 private _amountIn;
  ISwapRouter.ExactOutputSingleParams public lastCall;

  function setAmountIn(uint256 __amountIn) external {
    _amountIn = __amountIn;
  }

  function exactOutputSingle(ISwapRouter.ExactOutputSingleParams memory _params) external returns (uint256 __amountIn) {
    // Make sure that allowance was configured correctly
    uint256 _allowance = IERC20Detailed(_params.tokenIn).allowance(msg.sender, address(this));
    require(_allowance == _params.amountInMaximum);

    lastCall = _params;

    __amountIn = _amountIn;
  }
}
