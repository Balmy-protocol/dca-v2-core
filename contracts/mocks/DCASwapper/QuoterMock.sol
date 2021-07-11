// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

import '@uniswap/v3-periphery/contracts/interfaces/IQuoterV2.sol';
import '../../interfaces/IERC20Detailed.sol';

contract QuoterMock {
  uint256 private _amountNecessary;

  function setAmountNecessary(uint256 __amountNecessary) external {
    _amountNecessary = __amountNecessary;
  }

  function quoteExactOutputSingle(IQuoterV2.QuoteExactOutputSingleParams memory)
    external
    view
    returns (
      uint256 __amountNecessary,
      uint160 _sqrtPriceX96After,
      uint32 _initializedTicksCrossed,
      uint256 _gasEstimate
    )
  {
    __amountNecessary = _amountNecessary;
    _sqrtPriceX96After = 0;
    _initializedTicksCrossed = 0;
    _gasEstimate = 0;
  }
}
