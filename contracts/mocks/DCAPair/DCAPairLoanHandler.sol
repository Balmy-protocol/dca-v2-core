// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.6;

import '../../DCAPair/DCAPairLoanHandler.sol';
import './DCAPairParameters.sol';

contract DCAPairLoanHandlerMock is DCAPairLoanHandler, DCAPairParametersMock {
  constructor(
    IERC20Metadata _tokenA,
    IERC20Metadata _tokenB,
    IDCAGlobalParameters _globalParameters
  ) DCAPairParametersMock(_globalParameters, _tokenA, _tokenB) {}
}
