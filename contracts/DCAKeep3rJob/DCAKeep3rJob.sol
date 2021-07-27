// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.4;

import '@openzeppelin/contracts/utils/structs/EnumerableSet.sol';
import '../utils/Governable.sol';
import '../interfaces/IDCAKeep3rJob.sol';
import '../libraries/CommonErrors.sol';

contract DCAKeep3rJob is IDCAKeep3rJob, Governable {
  using EnumerableSet for EnumerableSet.AddressSet;

  IDCAFactory public immutable override factory;
  EnumerableSet.AddressSet internal _watchedPairs;

  constructor(address _governor, IDCAFactory _factory) Governable(_governor) {
    if (address(_factory) == address(0)) revert CommonErrors.ZeroAddress();
    factory = _factory;
  }

  function startWatchingPairs(address[] calldata _pairs) external override onlyGovernor {
    for (uint256 i; i < _pairs.length; i++) {
      if (!factory.isPair(_pairs[i])) revert InvalidPairAddress();
      _watchedPairs.add(_pairs[i]);
    }
    emit WatchingNewPairs(_pairs);
  }

  function stopWatchingPairs(address[] calldata _pairs) external override onlyGovernor {
    for (uint256 i; i < _pairs.length; i++) {
      _watchedPairs.remove(_pairs[i]);
    }
    emit StoppedWatchingPairs(_pairs);
  }

  function watchedPairs() external view override returns (address[] memory _pairs) {
    uint256 _length = _watchedPairs.length();
    _pairs = new address[](_length);
    for (uint256 i; i < _length; i++) {
      _pairs[i] = _watchedPairs.at(i);
    }
  }
}
