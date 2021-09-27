// SPDX-License-Identifier: UNLICENSED

pragma solidity >=0.8.7 <0.9.0;

import '../../DCAHub/DCAHubParameters.sol';

contract DCAHubParametersMock is DCAHubParameters {
  function setPlatformBalance(address _token, uint256 _amount) external {
    platformBalance[_token] = _amount;
  }

  function addActiveSwapInterval(
    address _tokenA,
    address _tokenB,
    bytes1 _swapIntervalMask
  ) external {
    activeSwapIntervals[_tokenA][_tokenB] |= _swapIntervalMask;
  }

  function removeActiveSwapInterval(
    address _tokenA,
    address _tokenB,
    bytes1 _swapIntervalMask
  ) external {
    activeSwapIntervals[_tokenA][_tokenB] &= ~_swapIntervalMask;
  }

  function isSwapIntervalActive(
    address _tokenA,
    address _tokenB,
    bytes1 _swapIntervalMask
  ) external view returns (bool _isIntervalActive) {
    bytes1 _byte = _tokenA < _tokenB ? activeSwapIntervals[_tokenA][_tokenB] : activeSwapIntervals[_tokenB][_tokenA];
    _isIntervalActive = _byte & _swapIntervalMask != 0;
  }

  function setSwapAmountDelta(
    address _tokenA,
    address _tokenB,
    bytes1 _swapIntervalMask,
    uint32 _swap,
    int128 _deltaAToB,
    int128 _deltaBToA
  ) external {
    swapAmountDelta[_tokenA][_tokenB][_swapIntervalMask][_swap] = SwapDelta(_deltaAToB, _deltaBToA);
  }

  function setAcummRatio(
    address _tokenA,
    address _tokenB,
    bytes1 _swapIntervalMask,
    uint32 _swap,
    uint256 _accumRatioAToB,
    uint256 _accumRatioBToA
  ) external {
    accumRatio[_tokenA][_tokenB][_swapIntervalMask][_swap] = AccumRatio(_accumRatioAToB, _accumRatioBToA);
  }

  function setNextAmountsToSwap(
    address _tokenA,
    address _tokenB,
    bytes1 _swapIntervalMask,
    uint224 _amountToSwapAToB,
    uint224 _amountToSwapBToA
  ) external {
    swapData[_tokenA][_tokenB][_swapIntervalMask].nextAmountToSwapAToB = _amountToSwapAToB;
    swapData[_tokenA][_tokenB][_swapIntervalMask].nextAmountToSwapBToA = _amountToSwapBToA;
  }

  function setPerformedSwaps(
    address _tokenA,
    address _tokenB,
    bytes1 _swapIntervalMask,
    uint32 _performedSwaps
  ) external {
    swapData[_tokenA][_tokenB][_swapIntervalMask].performedSwaps = _performedSwaps;
  }

  function getFeeFromAmount(uint32 _feeAmount, uint256 _amount) external pure returns (uint256) {
    return _getFeeFromAmount(_feeAmount, _amount);
  }
}
