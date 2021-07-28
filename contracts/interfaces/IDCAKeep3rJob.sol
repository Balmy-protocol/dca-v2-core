// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.8.4;

import './IDCAFactory.sol';
import './IDCASwapper.sol';

interface IDCAKeep3rJob {
  event SubsidizingNewPairs(address[] _pairs);
  event StoppedSubsidizingPairs(address[] _pairs);

  error InvalidPairAddress();
  error PairNotSubsidized();

  /* Public getters */
  function subsidizedPairs() external view returns (address[] memory);

  function factory() external view returns (IDCAFactory);

  function swapper() external view returns (IDCASwapper);

  /**
   * This method isn't a view and it is extremelly expensive and inefficient.
   * DO NOT call this method on-chain, it is for off-chain purposes only.
   */
  function getPairsToSwap() external returns (IDCASwapper.PairToSwap[] memory _pairs);

  /* Public setters */
  function startSubsidizingPairs(address[] calldata) external;

  function stopSubsidizingPairs(address[] calldata) external;

  /**
   * Takes an array of swaps, and executes as many as possible, returning the amount that was swapped
   */
  function swapPairs(IDCASwapper.PairToSwap[] calldata _pairsToSwap) external returns (uint256 _amountSwapped);
}
