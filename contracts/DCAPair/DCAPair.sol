// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.6;
pragma abicoder v2;

import './DCAPairParameters.sol';
import './DCAPairPositionHandler.sol';
import './DCAPairSwapHandler.sol';
import './DCAPairLoanHandler.sol';

contract DCAPair is DCAPairParameters, DCAPairSwapHandler, DCAPairPositionHandler, DCAPairLoanHandler, IDCAPair {
  constructor(
    IDCAGlobalParameters _globalParameters,
    IERC20Metadata _tokenA,
    IERC20Metadata _tokenB
  ) DCAPairParameters(_globalParameters, _tokenA, _tokenB) DCAPairPositionHandler(_tokenA, _tokenB) {}
}
