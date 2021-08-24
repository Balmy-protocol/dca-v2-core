// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.6;

import '../../DCAHub/DCAHubLoanHandler.sol';
import './DCAHubParameters.sol';

contract DCAHubLoanHandlerMock is DCAHubLoanHandler, DCAHubParametersMock {
  constructor(
    IERC20Metadata _tokenA,
    IERC20Metadata _tokenB,
    IDCAGlobalParameters _globalParameters
  ) DCAHubParametersMock(_globalParameters, _tokenA, _tokenB) {}
}
