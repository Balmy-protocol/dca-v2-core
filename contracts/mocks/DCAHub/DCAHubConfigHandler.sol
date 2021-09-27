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

  function isSwapIntervalAllowed(bytes1 _swapIntervalMask) external view returns (bool) {
    return allowedSwapIntervals & _swapIntervalMask != 0;
  }
}
