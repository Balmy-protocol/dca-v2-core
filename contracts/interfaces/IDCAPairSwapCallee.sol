// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.6;

import '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';

/// @title The interface for handling flash swaps
/// @notice Users that want to execute flash swaps must implement this interface
interface IDCAPairSwapCallee {
  /// @notice Handles the flash swap callback
  /// @param _sender The swap originator
  /// @param _tokenA Address for token A
  /// @param _tokenB Address for token B
  /// @param _amountBorrowedTokenA Amount borrowed in token A
  /// @param _amountBorrowedTokenB Amount borrowed in token B
  /// @param _isRewardTokenA Determines which token is the reward and which to provide to the pair
  /// @param _rewardAmount How much was sent to this contract optimistically
  /// @param _amountToProvide How much needs to be sent back to the pair
  /// @param _data Arbitrary bytes sent to the pair when initiating the swap
  // solhint-disable-next-line func-name-mixedcase
  function DCAPairSwapCall(
    address _sender,
    IERC20Metadata _tokenA,
    IERC20Metadata _tokenB,
    uint256 _amountBorrowedTokenA,
    uint256 _amountBorrowedTokenB,
    bool _isRewardTokenA,
    uint256 _rewardAmount,
    uint256 _amountToProvide,
    bytes calldata _data
  ) external;
}
