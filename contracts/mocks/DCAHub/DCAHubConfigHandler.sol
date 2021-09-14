// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.6;

import '../../DCAHub/DCAHubConfigHandler.sol';
import './DCAHubParameters.sol';

contract DCAHubConfigHandlerMock is DCAHubConfigHandler, DCAHubParametersMock {
  constructor(
    IERC20Metadata _tokenA,
    IERC20Metadata _tokenB,
    IDCAGlobalParameters _globalParameters,
    address _immediateGovernor,
    address _timeLockedGovernor,
    IDCATokenDescriptor _nftDescriptor,
    ITimeWeightedOracle _oracle
  )
    DCAHubParametersMock(_globalParameters, _tokenA, _tokenB)
    DCAHubConfigHandler(_immediateGovernor, _timeLockedGovernor, _nftDescriptor, _oracle)
  {}
}
