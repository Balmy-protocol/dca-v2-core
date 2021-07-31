// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.6;

import './IDCAFactory.sol';
import './IDCASwapper.sol';
import './IKeep3rV1.sol';

interface IDCAKeep3rJob {
  event SubsidizingNewPairs(address[] _pairs);
  event StoppedSubsidizingPairs(address[] _pairs);
  event SwapperSet(IDCASwapper _swapper);
  event Keep3rV1Set(IKeep3rV1 _keep3rV1);
  event Worked(uint256 _amountSwapped);
  event DelaySet(uint32 _swapInterval, uint32 _delay);

  error InvalidPairAddress();
  error PairNotSubsidized();
  error NotAKeeper();
  error NotWorked();
  error MustWaitDelay();

  /* Public getters */
  function subsidizedPairs() external view returns (address[] memory);

  function keep3rV1() external view returns (IKeep3rV1);

  function factory() external view returns (IDCAFactory);

  function swapper() external view returns (IDCASwapper);

  function delay(uint32 _swapInterval) external view returns (uint32 _delay);

  /**
   * This method isn't a view and it is extremelly expensive and inefficient.
   * DO NOT call this method on-chain, it is for off-chain purposes only.
   */
  function workable() external returns (IDCASwapper.PairToSwap[] memory, uint32[] memory);

  /* Public setters */
  function setKeep3rV1(IKeep3rV1 _keep3rV1) external;

  function setSwapper(IDCASwapper _swapper) external;

  function startSubsidizingPairs(address[] calldata) external;

  function stopSubsidizingPairs(address[] calldata) external;

  function setDelay(uint32 _swapInterval, uint32 _delay) external;

  /**
   * Takes an array of swaps, and executes as many as possible, returning the amount that was swapped
   */
  function work(IDCASwapper.PairToSwap[] calldata _pairs, uint32[] calldata _smallestIntervals) external returns (uint256 _amountSwapped);
}
