// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.8.4;

import './IDCAFactory.sol';
import './IDCASwapper.sol';
import './IKeep3rV1.sol';

interface IDCAKeep3rJob {
  event SubsidizingNewPairs(address[] _pairs);
  event StoppedSubsidizingPairs(address[] _pairs);
  event SwapperSet(IDCASwapper _swapper);
  event Keep3rV1Set(IKeep3rV1 _keep3rV1);

  error InvalidPairAddress();
  error PairNotSubsidized();
  error NotAKeeper();

  /* Public getters */
  function subsidizedPairs() external view returns (address[] memory);

  function keep3rV1() external view returns (IKeep3rV1);

  function factory() external view returns (IDCAFactory);

  function swapper() external view returns (IDCASwapper);

  /**
   * This method isn't a view and it is extremelly expensive and inefficient.
   * DO NOT call this method on-chain, it is for off-chain purposes only.
   */
  function workable() external returns (IDCASwapper.PairToSwap[] memory);

  /* Public setters */
  function setKeep3rV1(IKeep3rV1 _keep3rV1) external;

  function setSwapper(IDCASwapper _swapper) external;

  function startSubsidizingPairs(address[] calldata) external;

  function stopSubsidizingPairs(address[] calldata) external;

  /**
   * Takes an array of swaps, and executes as many as possible, returning the amount that was swapped
   */

  function work(IDCASwapper.PairToSwap[] calldata _pairs) external returns (uint256 _amountSwapped);
}
