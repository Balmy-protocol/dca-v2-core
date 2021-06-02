// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

import './IERC20Detailed.sol';

interface IDCAPairLoanCallee {
  // solhint-disable-next-line func-name-mixedcase
  function DCAPairLoanCall(
    address _sender,
    IERC20Detailed _tokenA,
    IERC20Detailed _tokenB,
    uint256 _amountBorrowedTokenA,
    uint256 _amountBorrowedTokenB,
    uint256 _feeTokenA,
    uint256 _feeTokenB,
    bytes calldata _data
  ) external;
}
