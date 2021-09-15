// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.6;

import '../../DCAHub/DCAHubLoanHandler.sol';
import './DCAHubConfigHandler.sol';

contract DCAHubLoanHandlerMock is DCAHubLoanHandler, DCAHubConfigHandlerMock {
  constructor(
    IERC20Metadata _tokenA,
    IERC20Metadata _tokenB,
    IDCAGlobalParameters _globalParameters,
    address _immediateGovernor,
    address _timeLockedGovernor,
    IDCATokenDescriptor _nftDescriptor,
    ITimeWeightedOracle _oracle
  ) DCAHubConfigHandlerMock(_tokenA, _tokenB, _globalParameters, _immediateGovernor, _timeLockedGovernor, _nftDescriptor, _oracle) {}
}
