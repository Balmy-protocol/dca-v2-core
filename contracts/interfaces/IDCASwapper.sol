// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.6;

import '../interfaces/IDCAPair.sol';
import '../utils/CollectableDust.sol';

/// @title The interface for a contract that can execute DCA swaps
/// @notice This contract will take a DCA swap and execute the opposite trade in a DEX
/// in order to return the expected funds and complete the swap
interface IDCASwapper is ICollectableDust {
  /// @notice A pair to swap
  struct PairToSwap {
    // The pair to swap
    IDCAPair pair;
    // Path to execute the best swap possible
    bytes swapPath;
  }

  /// @notice Emitted when a list of pairs is swapped correctly
  /// @param _pairsToSwap The list of swaps that was attempted to swap
  /// @param _amountSwapped The amount of pairs that was actually swapped
  event Swapped(PairToSwap[] _pairsToSwap, uint256 _amountSwapped);

  /// @notice Emitted when trying to swap an empty list of pairs
  error ZeroPairsToSwap();

  /// @notice Returns whether the swapper is paused or not
  /// @return _isPaused Whether the swapper is paused or not
  function paused() external view returns (bool _isPaused);

  /// @notice Takes a pair and tries to find the best swap for it
  /// @dev DO NOT call this method on-chain, it is for off-chain purposes only. Is is extremely expensive and innefficient
  /// @param _pair The pair to find the best swap for
  /// @return _swapPath The path to execute the best swap for the pair. Should be used when calling swapPairs.
  /// Will be empty (length = 0) if there is no path available and the pair can't be swapped.
  function findBestSwap(IDCAPair _pair) external returns (bytes memory _swapPath);

  /// @notice Takes a list of pairs to swap, and tries to swap as many as possible
  /// @dev The method checks how much gas is left, and stops before reaching the limit. So the
  /// last pairs in the array are less likely to be swapped.
  /// Will revert with ZeroPairsToSwap if _pairsToSwap is empty
  /// Will revert if called when paused
  /// @param _pairsToSwap The list of pairs so swap
  /// @return _amountSwapped How many pairs were actually swapped
  function swapPairs(PairToSwap[] calldata _pairsToSwap) external returns (uint256 _amountSwapped);

  /// @notice Pauses the swapper
  function pause() external;

  /// @notice Unpauses the swapper
  function unpause() external;
}
