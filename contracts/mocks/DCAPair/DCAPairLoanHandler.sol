// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import '../../DCAPair/DCAPairLoanHandler.sol';
import './DCAPairParameters.sol';

contract DCAPairLoanHandlerMock is DCAPairLoanHandler, DCAPairParametersMock {
  constructor(
    IERC20Detailed _token0,
    IERC20Detailed _token1,
    IDCAGlobalParameters _globalParameters
  ) DCAPairParametersMock(_globalParameters, _token0, _token1) {}
}
