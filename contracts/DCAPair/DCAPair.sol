// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;
pragma abicoder v2;

import './DCAPairParameters.sol';
import './DCAPairPositionHandler.sol';
import './DCAPairSwapHandler.sol';

interface IDCAPair is IDCAPairParameters, IDCAPairSwapHandler, IDCAPairPositionHandler {}

contract DCAPair is DCAPairParameters, DCAPairSwapHandler, DCAPairPositionHandler, IDCAPair {
  constructor(
    IERC20Detailed _tokenA,
    IERC20Detailed _tokenB,
    uint256 _swapInterval
  )
    DCAPairParameters(IDCAFactory(msg.sender), _tokenA, _tokenB)
    DCAPairSwapHandler(ISlidingOracle(address(0xe)), _swapInterval)
    DCAPairPositionHandler(_tokenA, _tokenB)
  {}
}
