// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

import '../../interfaces/IDCAPair.sol';

contract DCAPairMock {
  bool public swapped;
  IDCAPairSwapHandler.NextSwapInformation private _nextSwapInfo;
  uint256 private _gasToConsume;

  function swap(
    uint256,
    uint256,
    address,
    bytes calldata
  ) external {
    swapped = true;
    uint256 _start = gasleft();
    while (_start - gasleft() < _gasToConsume) {}
  }

  function setGasToConsumeInSwap(uint256 __gasToConsume) external {
    _gasToConsume = __gasToConsume;
  }

  function getNextSwapInfo() public view returns (IDCAPairSwapHandler.NextSwapInformation memory) {
    return _nextSwapInfo;
  }

  function setNextSwapInfo(
    uint8 _amountOfSwaps,
    IERC20Detailed _tokenToRewardSwapperWith,
    IERC20Detailed _tokenToBeProvidedBySwapper,
    uint256 _amountToBeProvidedBySwapper,
    uint256 _amountToRewardSwapperWith
  ) public {
    _nextSwapInfo.amountOfSwaps = _amountOfSwaps;
    _nextSwapInfo.tokenToRewardSwapperWith = _tokenToRewardSwapperWith;
    _nextSwapInfo.tokenToBeProvidedBySwapper = _tokenToBeProvidedBySwapper;
    _nextSwapInfo.amountToBeProvidedBySwapper = _amountToBeProvidedBySwapper;
    _nextSwapInfo.amountToRewardSwapperWith = _amountToRewardSwapperWith;
  }
}
