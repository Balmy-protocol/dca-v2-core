// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.6;
pragma abicoder v2;

import './DCAHubParameters.sol';
import './DCAHubPositionHandler.sol';
import './DCAHubSwapHandler.sol';
import './DCAHubLoanHandler.sol';

contract DCAHub is DCAHubParameters, DCAHubSwapHandler, DCAHubPositionHandler, DCAHubLoanHandler, IDCAHub {
  constructor(
    IDCAGlobalParameters _globalParameters,
    IERC20Metadata _tokenA,
    IERC20Metadata _tokenB
  ) DCAHubParameters(_globalParameters, _tokenA, _tokenB) DCAHubPositionHandler(_tokenA, _tokenB) {}
}
