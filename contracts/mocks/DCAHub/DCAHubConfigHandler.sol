// SPDX-License-Identifier: UNLICENSED

pragma solidity >=0.8.7 <0.9.0;

import '../../DCAHub/DCAHubConfigHandler.sol';
import './DCAHubParameters.sol';

contract DCAHubConfigHandlerMock is DCAHubConfigHandler, DCAHubParametersMock {
  constructor(
    IERC20Metadata _tokenA,
    IERC20Metadata _tokenB,
    address _immediateGovernor,
    address _timeLockedGovernor,
    IDCATokenDescriptor _nftDescriptor,
    ITimeWeightedOracle _oracle
  ) DCAHubParametersMock(_tokenA, _tokenB) DCAHubConfigHandler(_immediateGovernor, _timeLockedGovernor, _nftDescriptor, _oracle) {}
}
