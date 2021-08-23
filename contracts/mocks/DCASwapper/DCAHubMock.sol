// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.6;

import '../../interfaces/IDCAHub.sol';

contract DCAHubMock {
  uint24 private _swappedFee;
  IDCAHubSwapHandler.NextSwapInformation private _nextSwapInfo;
  uint256 private _gasToConsume;

  function swap(
    uint256,
    uint256,
    address,
    bytes calldata _bytes
  ) external {
    _swappedFee = abi.decode(_bytes, (uint24));
    uint256 _start = gasleft();
    while (_start - gasleft() < _gasToConsume) {}
  }

  function swapped() external view returns (bool) {
    return _swappedFee > 0;
  }

  function swappedWithFee(uint24 _feeTier) external view returns (bool) {
    return _swappedFee == _feeTier;
  }

  function setGasToConsumeInSwap(uint256 __gasToConsume) external {
    _gasToConsume = __gasToConsume;
  }

  function getNextSwapInfo() external view returns (IDCAHubSwapHandler.NextSwapInformation memory) {
    return _nextSwapInfo;
  }

  function setNextSwapInfo(
    uint8 _amountOfSwaps,
    IERC20Metadata _tokenToRewardSwapperWith,
    IERC20Metadata _tokenToBeProvidedBySwapper,
    uint256 _amountToBeProvidedBySwapper,
    uint256 _amountToRewardSwapperWith
  ) external {
    _nextSwapInfo.amountOfSwaps = _amountOfSwaps;
    _nextSwapInfo.tokenToRewardSwapperWith = _tokenToRewardSwapperWith;
    _nextSwapInfo.tokenToBeProvidedBySwapper = _tokenToBeProvidedBySwapper;
    _nextSwapInfo.amountToBeProvidedBySwapper = _amountToBeProvidedBySwapper;
    _nextSwapInfo.amountToRewardSwapperWith = _amountToRewardSwapperWith;
  }
}
