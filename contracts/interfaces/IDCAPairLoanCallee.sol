// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.6;

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
