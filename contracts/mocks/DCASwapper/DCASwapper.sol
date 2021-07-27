// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.4;

import '../../DCASwapper/DCASwapper.sol';

contract DCASwapperMock is DCASwapper {
  constructor(
    address _governor,
    ISwapRouter _router,
    ICustomQuoter _quoter
  ) DCASwapper(_governor, _router, _quoter) {}
}
