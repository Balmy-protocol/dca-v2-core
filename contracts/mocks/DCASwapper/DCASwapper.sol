// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.4;

import '../../DCASwapper/DCASwapper.sol';

contract DCASwapperMock is DCASwapper {
  constructor(address _governor, IDCAFactory _factory) DCASwapper(_governor, _factory) {}
}
