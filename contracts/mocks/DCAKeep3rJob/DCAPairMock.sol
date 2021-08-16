// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.6;

import '../../interfaces/IDCAPair.sol';

contract DCAPairMock {
  mapping(uint32 => uint32) private _nextSwapAvailable;
  IDCAPairSwapHandler.NextSwapInformation private _nextSwapInfo;

  function nextSwapAvailable(uint32 _swapInterval) external view returns (uint32) {
    return _nextSwapAvailable[_swapInterval];
  }

  function setNextSwapAvailable(uint32 _swapInterval, uint32 _moment) external {
    _nextSwapAvailable[_swapInterval] = _moment;
  }

  function getNextSwapInfo() external view returns (IDCAPairSwapHandler.NextSwapInformation memory) {
    return _nextSwapInfo;
  }

  function setNextSwapInfo(uint32[] calldata _swapIntervals) external {
    _nextSwapInfo.amountOfSwaps = uint8(_swapIntervals.length);
    delete _nextSwapInfo.swapsToPerform;
    for (uint256 i; i < _swapIntervals.length; i++) {
      _nextSwapInfo.swapsToPerform.push();
      _nextSwapInfo.swapsToPerform[i].interval = _swapIntervals[i];
    }
  }
}
