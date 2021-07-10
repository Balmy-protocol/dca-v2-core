// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

contract UniswapV3FactoryMock {
  int24 private _tickSpacing;
  mapping(address => mapping(address => mapping(uint24 => address))) private _pools;

  function feeAmountTickSpacing(uint24) external view returns (int24) {
    return _tickSpacing;
  }

  function getPool(
    address _tokenA,
    address _tokenB,
    uint24 _fee
  ) external view returns (address _pool) {
    _pool = _pools[_tokenA][_tokenB][_fee];
  }

  function setTickSpacing(int24 __tickSpacing) public {
    _tickSpacing = __tickSpacing;
  }

  function setPool(
    address _tokenA,
    address _tokenB,
    uint24 _fee,
    address _pool
  ) external {
    _pools[_tokenA][_tokenB][_fee] = _pool;
  }
}
