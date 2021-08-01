// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.6;

import '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';

/// @title The interface for handling flash loans
/// @notice Users that want to execute flash loans must implement this interface
interface IDCAPairLoanCallee {
  /// @notice Handles the flash loan callback
  /// @param _sender The loan originator
  /// @param _tokenA Address for token A
  /// @param _tokenB Address for token B
  /// @param _amountBorrowedTokenA Amount borrowed in token A
  /// @param _amountBorrowedTokenB Amount borrowed in token B
  /// @param _feeTokenA How much extra to return in fees in token A
  /// @param _feeTokenB How much extra to return in fees in token B
  /// @param _data Arbitrary bytes sent to the pair when initiating the loan
  // solhint-disable-next-line func-name-mixedcase
  function DCAPairLoanCall(
    address _sender,
    IERC20Metadata _tokenA,
    IERC20Metadata _tokenB,
    uint256 _amountBorrowedTokenA,
    uint256 _amountBorrowedTokenB,
    uint256 _feeTokenA,
    uint256 _feeTokenB,
    bytes calldata _data
  ) external;
}
