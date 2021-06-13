// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.4;
pragma abicoder v2;

import './DCAPairParameters.sol';
import './DCAPairPositionHandler.sol';
import './DCAPairSwapHandler.sol';
import './DCAPairLoanHandler.sol';

contract DCAPair is DCAPairParameters, DCAPairSwapHandler, DCAPairPositionHandler, DCAPairLoanHandler, IDCAPair {
  constructor(
    IDCAGlobalParameters _globalParameters,
    ISlidingOracle _oracle,
    IERC20Detailed _tokenA,
    IERC20Detailed _tokenB
  ) DCAPairParameters(_globalParameters, _tokenA, _tokenB) DCAPairSwapHandler(_oracle) DCAPairPositionHandler(_tokenA, _tokenB) {}
}
