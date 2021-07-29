// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.4;

import '../../DCASwapper/DCAUniswapV3Swapper.sol';

contract DCAUniswapV3SwapperMock is DCAUniswapV3Swapper {
  constructor(
    address _governor,
    ISwapRouter _router,
    ICustomQuoter _quoter
  ) DCAUniswapV3Swapper(_governor, _router, _quoter) {}
}
