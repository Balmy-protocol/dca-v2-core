// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7 <0.9.0;

import '../../DCAHub/DCAHubLoanHandler.sol';
import './DCAHubConfigHandler.sol';

contract DCAHubLoanHandlerMock is DCAHubLoanHandler, DCAHubConfigHandlerMock {
  constructor(
    IERC20Metadata _tokenA,
    IERC20Metadata _tokenB,
    address _immediateGovernor,
    address _timeLockedGovernor,
    ITimeWeightedOracle _oracle
  ) DCAHubConfigHandlerMock(_tokenA, _tokenB, _immediateGovernor, _timeLockedGovernor, _oracle) {}
}
