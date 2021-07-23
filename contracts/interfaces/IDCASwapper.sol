// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.8.4;

import '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';
import '@uniswap/v3-periphery/contracts/interfaces/IQuoter.sol';
import '../interfaces/IDCAFactory.sol';

interface IDCASwapper {
  event WatchingNewPairs(address[] _pairs);
  event StoppedWatchingPairs(address[] _pairs);
  event Swapped(IDCAPair[] _pairsToSwap, uint256 _amountSwapped);

  error InvalidPairAddress();
  error ZeroPairsToSwap();

  /* Public getters */
  function watchedPairs() external view returns (address[] memory);

  function factory() external view returns (IDCAFactory);

  function swapRouter() external view returns (ISwapRouter);

  function quoter() external view returns (IQuoter);

  /**
   * This method isn't a view and it is extremelly expensive and inefficient.
   * DO NOT call this method on-chain, it is for off-chain purposes only.
   */
  function getPairsToSwap() external returns (IDCAPair[] memory);

  /* Public setters */
  function startWatchingPairs(address[] calldata) external;

  function stopWatchingPairs(address[] calldata) external;

  /**
   * Takes an array of swaps, and executes as many as possible, returning the amount that was swapped
   */
  function swapPairs(IDCAPair[] calldata _pairsToSwap) external returns (uint256 _amountSwapped);
}
