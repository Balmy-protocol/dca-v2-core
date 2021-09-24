// SPDX-License-Identifier: UNLICENSED

pragma solidity >=0.8.7 <0.9.0;

import '../../DCAHub/DCAHubConfigHandler.sol';
import './DCAHubParameters.sol';

contract DCAHubConfigHandlerMock is DCAHubConfigHandler, DCAHubParametersMock {
  constructor(
    address _immediateGovernor,
    address _timeLockedGovernor,
    ITimeWeightedOracle _oracle
  ) DCAHubConfigHandler(_immediateGovernor, _timeLockedGovernor, _oracle) {}

  function isSwapIntervalAllowed(uint32 _swapInterval) external view returns (bool) {
    bytes1 _mask = intervalToMask(_swapInterval);
    return allowedSwapIntervals & _mask != 0;
  }
}
