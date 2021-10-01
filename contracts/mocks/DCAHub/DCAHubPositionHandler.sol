// SPDX-License-Identifier: UNLICENSED

pragma solidity >=0.8.7 <0.9.0;

import '../../DCAHub/DCAHubPositionHandler.sol';
import './DCAHubConfigHandler.sol';

contract DCAHubPositionHandlerMock is DCAHubPositionHandler, DCAHubConfigHandlerMock {
  constructor(address _immediateGovernor, IDCAPermissionManager _permissionManager)
    DCAHubConfigHandlerMock(_immediateGovernor, address(1), ITimeWeightedOracle(address(1)))
    DCAHubPositionHandler(_permissionManager)
  {}

  // PositionHandler
  function internalPosition(uint256 _positionId) external view returns (DCA memory _dca) {
    _dca = _userPositions[_positionId];
  }

  function setLastUpdated(uint256 _positionId, uint32 _lastUpdated) external {
    _userPositions[_positionId].swapWhereLastUpdated = _lastUpdated;
  }
}
