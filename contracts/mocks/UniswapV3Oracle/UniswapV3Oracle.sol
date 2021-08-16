// SPDX-License-Identifier: UNLICENSED

pragma solidity >=0.5.0 <0.8.0;

import '../../UniswapV3Oracle/UniswapV3Oracle.sol';

contract UniswapV3OracleMock is UniswapV3Oracle {
  constructor(address _governor, IUniswapV3Factory _factory) UniswapV3Oracle(_governor, _factory) {}
}
