// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.6;

import '../../DCAKeep3rJob/DCAKeep3rJob.sol';

contract DCAKeep3rJobMock is DCAKeep3rJob {
  uint32 private _customTimestamp;

  constructor(
    address _governor,
    IDCAFactory _factory,
    IKeep3rV1 _keep3rV1,
    IDCASwapper _swapper
  ) DCAKeep3rJob(_governor, _factory, _keep3rV1, _swapper) {}

  function setBlockTimestamp(uint32 _blockTimestamp) external {
    _customTimestamp = _blockTimestamp;
  }

  function _getTimestamp() internal view override returns (uint32 _blockTimestamp) {
    _blockTimestamp = (_customTimestamp > 0) ? _customTimestamp : super._getTimestamp();
  }
}
