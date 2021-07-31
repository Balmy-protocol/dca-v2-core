// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.6;

import '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';
import '@uniswap/v3-periphery/contracts/interfaces/IQuoter.sol';
import '@uniswap/v3-periphery/contracts/interfaces/IPeripheryImmutableState.sol';
import '../interfaces/IDCAPair.sol';
import '../utils/CollectableDust.sol';

interface ICustomQuoter is IQuoter, IPeripheryImmutableState {}

interface IDCASwapper is ICollectableDust {
  struct PairToSwap {
    IDCAPair pair;
    bytes swapPath;
  }

  event Swapped(PairToSwap[] _pairsToSwap, uint256 _amountSwapped);

  error ZeroPairsToSwap();

  /* Public getters */
  function paused() external view returns (bool);

  /**
   * This method isn't a view and it is extremelly expensive and inefficient.
   * DO NOT call this method on-chain, it is for off-chain purposes only.
   * This method will some result in encoded bytes, to guide the swap when executed.
   * If the result is an empty set of bytes, then there is no swap to execute.
   */
  function findBestSwap(IDCAPair _pair) external returns (bytes memory _swapPath);

  /* Public setters */
  /**
   * Takes an array of swaps, and executes as many as possible, returning the amount that was swapped
   */
  function swapPairs(PairToSwap[] calldata _pairsToSwap) external returns (uint256 _amountSwapped);

  function pause() external;

  function unpause() external;
}
