// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

contract UniswapV3PoolMock {
  uint16 public cardinalitySent;

  function increaseObservationCardinalityNext(uint16 _cardinality) external {
    cardinalitySent = _cardinality;
  }

  function reset() external {
    cardinalitySent = 0;
  }
}
