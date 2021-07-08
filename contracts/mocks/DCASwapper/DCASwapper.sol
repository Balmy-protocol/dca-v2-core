// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.4;

import '../../DCASwapper/DCASwapper.sol';

contract DCASwapperMock is DCASwapper {
  constructor(
    address _governor,
    IDCAFactory _factory,
    ISwapRouter _router,
    IQuoterV2 _quoter
  ) DCASwapper(_governor, _factory, _router, _quoter) {}

  function shouldSwapPair(IDCAPair _pair) external returns (bool _shouldSwap) {
    _shouldSwap = _shouldSwapPair(_pair);
  }
}
