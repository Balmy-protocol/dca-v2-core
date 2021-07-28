// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

contract UniswapV3PoolMock {
  uint16 public cardinalitySent;
  uint16 private _liquidity = 1;

  function increaseObservationCardinalityNext(uint16 _cardinality) external {
    cardinalitySent = _cardinality;
  }

  function liquidity() external view returns (uint128) {
    return _liquidity;
  }

  function setLiquidity(uint16 __liquidity) external {
    _liquidity = __liquidity;
  }

  function reset() external {
    cardinalitySent = 0;
  }
}
