// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7 <0.9.0;

import '../../DCAHub/DCAHubPlatformHandler.sol';
import './DCAHubConfigHandler.sol';

contract DCAHubPlatformHandlerMock is DCAHubPlatformHandler, DCAHubConfigHandlerMock {
  constructor(address _timelockedGovernor) DCAHubConfigHandlerMock(address(1), _timelockedGovernor, IPriceOracle(address(1))) {}
}
