// SPDX-License-Identifier: BUSL-1.1
pragma solidity >=0.8.7 <0.9.0;

import './DCAHubParameters.sol';
import './DCAHubPositionHandler.sol';
import './DCAHubSwapHandler.sol';
import './DCAHubLoanHandler.sol';
import './DCAHubConfigHandler.sol';
import './DCAHubPlatformHandler.sol';

// TODO: Implement interface again
contract DCAHub is DCAHubParameters, DCAHubConfigHandler, DCAHubSwapHandler, DCAHubPositionHandler, DCAHubLoanHandler, DCAHubPlatformHandler {
  constructor(
    address _immediateGovernor,
    address _timeLockedGovernor,
    ITimeWeightedOracle _oracle,
    IDCAPermissionManager _permissionManager
  ) DCAHubPositionHandler(_permissionManager) DCAHubConfigHandler(_immediateGovernor, _timeLockedGovernor, _oracle) {}
}
