// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7 <0.9.0;

import '../../libraries/Intervals.sol';

contract IntervalsMock {
  function intervalToMask(uint32 _swapInterval) external pure returns (bytes1) {
    return Intervals.intervalToMask(_swapInterval);
  }

  function maskToInterval(bytes1 _mask) external pure returns (uint32) {
    return Intervals.maskToInterval(_mask);
  }

  function intervalsInByte(bytes1 _byte) external pure returns (uint32[] memory) {
    return Intervals.intervalsInByte(_byte);
  }
}
