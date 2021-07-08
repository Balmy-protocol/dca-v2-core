// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.8.4;

import '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';
import '../interfaces/IDCAFactory.sol';

interface IDCASwapper {
  event WatchingNewPairs(address[] _pairs);
  event StoppedWatchingPairs(address[] _pairs);

  error InvalidPairAddress();

  /* Public getters */
  function watchedPairs() external view returns (address[] memory);

  function factory() external view returns (IDCAFactory);

  function swapRouter() external view returns (ISwapRouter);

  /* Public setters */
  function startWatchingPairs(address[] calldata) external;

  function stopWatchingPairs(address[] calldata) external;
}
