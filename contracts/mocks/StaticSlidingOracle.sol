// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

import 'hardhat/console.sol';
import '../interfaces/ISlidingOracle.sol';

contract StaticSlidingOracle is ISlidingOracle {
  uint256 public rate;
  uint256 public decimals;

  constructor(uint256 _rate, uint256 _decimals) {
    rate = _rate;
    decimals = _decimals;
  }

  function setRate(uint256 _rate, uint256 _decimals) public {
    rate = _rate;
    decimals = _decimals;
  }

  function current(
    address _tokenIn,
    uint256 _amountIn,
    address _tokenOut
  ) public view override returns (uint256 _amountOut) {
    _tokenIn;
    _tokenOut;
    _amountOut = (_amountIn * rate) / 10**decimals;
  }

  function quote(
    address _tokenIn,
    uint256 _amountIn,
    address _tokenOut,
    uint256 _granularity
  ) external view override returns (uint256 _amountOut) {
    _granularity;
    return current(_tokenIn, _amountIn, _tokenOut);
  }
}
