// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

import '@uniswap/v3-periphery/contracts/interfaces/IQuoterV2.sol';
import '../../interfaces/IERC20Detailed.sol';

contract QuoterMock {
  uint256 private _amountNecessary;

  function setAmountNecessary(uint256 __amountNecessary) external {
    _amountNecessary = __amountNecessary;
  }

  function quoteExactOutputSingle(
    address,
    address,
    uint24,
    uint256,
    uint160
  ) external view returns (uint256) {
    return _amountNecessary;
  }
}
