// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.8.4;

import '../interfaces/IDCAFactory.sol';

interface IDCASwapper {
  event WatchingNewPairs(address[] _pairs);
  event StoppedWatchingPairs(address[] _pairs);

  error InvalidPairAddress();

  /* Public getters */
  function watchedPairs() external view returns (address[] memory);

  function factory() external view returns (IDCAFactory);

  /* Public setters */
  function startWatchingPairs(address[] calldata) external;

  function stopWatchingPairs(address[] calldata) external;
}
