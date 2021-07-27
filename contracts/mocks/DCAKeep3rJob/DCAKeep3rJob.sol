// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.4;

import '../../DCAKeep3rJob/DCAKeep3rJob.sol';

contract DCAKeep3rJobMock is DCAKeep3rJob {
  constructor(address _governor, IDCAFactory _factory) DCAKeep3rJob(_governor, _factory) {}
}
