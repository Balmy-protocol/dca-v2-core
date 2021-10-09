// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7 <0.9.0;

import '../../DCAHub/DCAHubLoanHandler.sol';
import './DCAHubConfigHandler.sol';

contract DCAHubLoanHandlerMock is DCAHubLoanHandler, DCAHubConfigHandlerMock {
  constructor(
    address _immediateGovernor,
    address _timeLockedGovernor,
    IPriceOracle _oracle
  ) DCAHubConfigHandlerMock(_immediateGovernor, _timeLockedGovernor, _oracle) {}
}
