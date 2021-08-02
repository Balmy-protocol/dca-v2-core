// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.6;

import '../../interfaces/ITimeWeightedOracle.sol';

contract TimeWeightedOracleMock is ITimeWeightedOracle {
  uint256 public rate;
  uint256 public decimals;

  constructor(uint256 _rate, uint256 _decimals) {
    rate = _rate;
    decimals = _decimals;
  }

  function setRate(uint256 _rate, uint256 _decimals) external {
    rate = _rate;
    decimals = _decimals;
  }

  function canSupportPair(address, address) external pure override returns (bool) {
    return true;
  }

  function addSupportForPair(address _tokenA, address _tokenB) external override {}

  function quote(
    address,
    uint128 _amountIn,
    address
  ) external view override returns (uint256 _amountOut) {
    _amountOut = (_amountIn * rate) / 10**decimals;
  }
}
