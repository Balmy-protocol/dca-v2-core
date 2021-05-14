// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

interface ISlidingOracle {
  function current(
    address _tokenIn,
    uint256 _amountIn,
    address _tokenOut
  ) external view returns (uint256 _amountOut);

  function quote(
    address _tokenIn,
    uint256 _amountIn,
    address _tokenOut,
    uint256 _granularity
  ) external view returns (uint256 _amountOut);
}
