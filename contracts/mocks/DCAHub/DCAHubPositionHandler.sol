// SPDX-License-Identifier: UNLICENSED

pragma solidity >=0.8.7 <0.9.0;

import '../../DCAHub/DCAHubPositionHandler.sol';
import './DCAHubConfigHandler.sol';

contract DCAHubPositionHandlerMock is DCAHubPositionHandler, DCAHubConfigHandlerMock {
  constructor(
    address _immediateGovernor,
    IPriceOracle _oracle,
    IDCAPermissionManager _permissionManager
  ) DCAHubConfigHandlerMock(_immediateGovernor, address(1), _oracle) DCAHubPositionHandler(_permissionManager) {}

  function setLastUpdated(uint256 _positionId, uint32 _lastUpdated) external {
    _userPositions[_positionId].swapWhereLastUpdated = _lastUpdated;
  }
}
