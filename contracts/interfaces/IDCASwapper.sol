// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.8.4;

import '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';
import '@uniswap/v3-periphery/contracts/interfaces/IQuoter.sol';
import '@uniswap/v3-periphery/contracts/interfaces/IPeripheryImmutableState.sol';
import '../interfaces/IDCAPair.sol';
import '../utils/CollectableDust.sol';

interface ICustomQuoter is IQuoter, IPeripheryImmutableState {}

interface IDCASwapper is ICollectableDust {
  struct PairToSwap {
    IDCAPair pair;
    uint24 bestFeeTier;
  }

  event Swapped(PairToSwap[] _pairsToSwap, uint256 _amountSwapped);

  error ZeroPairsToSwap();

  /* Public getters */
  function swapRouter() external view returns (ISwapRouter);

  function quoter() external view returns (ICustomQuoter);

  function paused() external view returns (bool);

  /**
   * This method isn't a view and it is extremelly expensive and inefficient.
   * DO NOT call this method on-chain, it is for off-chain purposes only.
   */
  function getPairsToSwap() external returns (PairToSwap[] memory _pairs);

  /**
   * This method isn't a view and it is extremelly expensive and inefficient.
   * DO NOT call this method on-chain, it is for off-chain purposes only.
   * This method will return 0 if the pair should not be swapped, and max(uint24) if there is no need to go to Uniswap
   */
  function bestFeeTierForSwap(IDCAPair _pair) external returns (uint24 _feeTier);

  /* Public setters */
  /**
   * Takes an array of swaps, and executes as many as possible, returning the amount that was swapped
   */
  function swapPairs(PairToSwap[] calldata _pairsToSwap) external returns (uint256 _amountSwapped);

  function pause() external;

  function unpause() external;
}
