// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

contract UniswapV3FactoryMock {
  int24 private _tickSpacing;

  function feeAmountTickSpacing(uint24) external view returns (int24) {
    return _tickSpacing;
  }

  function setTickSpacing(int24 __tickSpacing) public {
    _tickSpacing = __tickSpacing;
  }
}
