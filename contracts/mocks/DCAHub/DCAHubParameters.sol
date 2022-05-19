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

  function setSwapAmountDelta(
    address _tokenA,
    address _tokenB,
    bytes1 _swapIntervalMask,
    uint32 _swap,
    uint128 _deltaAToB,
    uint128 _deltaBToA
  ) external {
    _swapAmountDelta[_tokenA][_tokenB][_swapIntervalMask][_swap] = SwapDelta(_deltaAToB, _deltaBToA);
  }

  function setAcummRatio(
    address _tokenA,
    address _tokenB,
    bytes1 _swapIntervalMask,
    uint32 _swap,
    uint256 _accumRatioAToB,
    uint256 _accumRatioBToA
  ) external {
    _accumRatio[_tokenA][_tokenB][_swapIntervalMask][_swap] = AccumRatio(_accumRatioAToB, _accumRatioBToA);
  }

  function setNextAmountsToSwap(
    address _tokenA,
    address _tokenB,
    bytes1 _swapIntervalMask,
    uint224 _amountToSwapAToB,
    uint224 _amountToSwapBToA
  ) external {
    _swapData[_tokenA][_tokenB][_swapIntervalMask].nextAmountToSwapAToB = _amountToSwapAToB;
    _swapData[_tokenA][_tokenB][_swapIntervalMask].nextAmountToSwapBToA = _amountToSwapBToA;
  }

  function setPerformedSwaps(
    address _tokenA,
    address _tokenB,
    bytes1 _swapIntervalMask,
    uint32 _performedSwaps
  ) external {
    _swapData[_tokenA][_tokenB][_swapIntervalMask].performedSwaps = _performedSwaps;
  }

  function setLastSwappedAt(
    address _tokenA,
    address _tokenB,
    bytes1 _swapIntervalMask,
    uint32 _lastSwappedAt
  ) external {
    _swapData[_tokenA][_tokenB][_swapIntervalMask].lastSwappedAt = _lastSwappedAt;
  }
}
