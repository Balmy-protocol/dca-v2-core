// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.6;

import './IDCAFactory.sol';
import './IDCASwapper.sol';
import './IKeep3rV1.sol';

/// @title Keep3r job that executes DCA swaps
/// @notice This contract will allow keep3rs to execute swaps and get paid with credits
interface IDCAKeep3rJob {
  /// @notice Emitted when new pairs are subsidized
  /// @param _pairs The address of the pairs that will now be subsidized
  event SubsidizingNewPairs(address[] _pairs);

  /// @notice Emitted when some pairs stop being subsidized
  /// @param _pairs The address of the pairs that will not be subsidized anymore
  event StoppedSubsidizingPairs(address[] _pairs);

  /// @notice Emitted when a new swapper is used
  /// @param _swapper The new swapper
  event SwapperSet(IDCASwapper _swapper);

  /// @notice Emitted when a keep3r is used
  /// @param _keep3rV1 The new keep3r
  event Keep3rV1Set(IKeep3rV1 _keep3rV1);

  /// @notice Emitted when swaps are executed
  /// @param _amountSwapped The amount of pairs that was swapped
  event Worked(uint256 _amountSwapped);

  /// @notice Emitted when a new delay is configured
  /// @param _swapInterval The swap interval that the delay will affect
  /// @param _delay The actual configured delay
  event DelaySet(uint32 _swapInterval, uint32 _delay);

  /// @notice Thrown when trying to subsidize an address that isn't a DCA pair
  error InvalidPairAddress();

  /// @notice Thrown when trying to work on a pair that is not being subsidized
  error PairNotSubsidized();

  /// @notice Thrown when the caller executing work is not a keeper
  error NotAKeeper();

  /// @notice Thrown when the caller tries to execute work with no pairs
  error NotWorked();

  /// @notice Thrown when a pair can technically be swapped, but the delay doesn't allow it
  error MustWaitDelay();

  /// @notice Returns a list of all the pairs that are currently subsidized
  /// @return _pairs An array with all the subsidized pairs
  function subsidizedPairs() external view returns (address[] memory _pairs);

  /// @notice Returns the Keep3r contract
  /// @return _keeper The Keep3r contract
  function keep3rV1() external view returns (IKeep3rV1 _keeper);

  /// @notice Returns the DCA factory
  /// @return _factory The DCA Factory
  function factory() external view returns (IDCAFactory _factory);

  /// @notice Returns the DCA swapper
  /// @return _swapper The DCA swapper
  function swapper() external view returns (IDCASwapper _swapper);

  /// @notice Returns the configured delay for a given swap interval
  /// @dev If none was configured, then it will return half the given swap interval
  /// @param _swapInterval The swap interval to check
  /// @return _delay The configured delay
  function delay(uint32 _swapInterval) external view returns (uint32 _delay);

  /// @notice Returns a list of pairs to swap, and also the smallest swap interval for each pair. The result should be sent to work
  /// @dev DO NOT call this method on-chain, it is for off-chain purposes only. Is is extremely expensive and innefficient
  /// @return _pairs An array with pairs and their swap path
  /// @return _smallestIntervals The smallest swap interval that can be swapped for each pair
  function workable() external returns (IDCASwapper.PairToSwap[] memory _pairs, uint32[] memory _smallestIntervals);

  /// @notice Sets a new address for the Keep3r contract
  /// @dev Will throw ZeroAddress if the zero address is passed
  /// @param _keep3rV1 The Keep3r contract
  function setKeep3rV1(IKeep3rV1 _keep3rV1) external;

  /// @notice Sets a new address for the swapper contract
  /// @dev Will throw ZeroAddress if the zero address is passed
  /// @param _swapper The swapper contract
  function setSwapper(IDCASwapper _swapper) external;

  /// @notice Adds some new pairs to the list of subsidized pairs
  /// @dev Will throw InvalidPairAddress if any of the given addresses is not a valid DCA pair
  /// @param _pairs The new pairs to add
  function startSubsidizingPairs(address[] calldata _pairs) external;

  /// @notice Removes some pairs from the list of subsidized pairs
  /// @param _pairs The pairs to remove
  function stopSubsidizingPairs(address[] calldata _pairs) external;

  /// @notice Sets a new delay for the given swap interval
  /// @param _swapInterval The swap interval that will be given the new delay
  /// @param _delay The new delay to set
  function setDelay(uint32 _swapInterval, uint32 _delay) external;

  /// @notice Takes a list of pairs to swap, and tries to swap as many as possible
  /// @dev The method checks how much gas is left, and stops before reaching the limit. So the
  /// last pairs in the array are less likely to be swapped. Will revert with:
  /// NotAKeeper if the caller is not a keep3r
  /// PairNotSubsidized if one of the given pairs is not subsidized
  /// MustWaitDelay if one of the given pairs must wait for the delay
  /// NotWorked if the caller tries to execute no pairs
  /// @param _pairs The list of pairs so swap
  /// @param _smallestIntervals The smallest swap interval that can be swapped for each pair
  /// @return _amountSwapped How many pairs were actually swapped
  function work(IDCASwapper.PairToSwap[] calldata _pairs, uint32[] calldata _smallestIntervals) external returns (uint256 _amountSwapped);
}
