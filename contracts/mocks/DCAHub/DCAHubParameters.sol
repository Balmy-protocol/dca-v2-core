// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.6;

import '../../DCAHub/DCAHubParameters.sol';

contract DCAHubParametersMock is DCAHubParameters {
  using EnumerableSet for EnumerableSet.UintSet;

  constructor(IERC20Metadata _tokenA, IERC20Metadata _tokenB) DCAHubParameters(_tokenA, _tokenB) {}

  // Mocks setters
  function internalBalanceOf(address _token) external view returns (uint256) {
    return _balances[_token];
  }

  function setInternalBalance(address _token, uint256 _amount) external {
    _balances[_token] = _amount;
  }

  function setPlatformBalance(address _token, uint256 _amount) external {
    platformBalance[_token] = _amount;
  }

  function addActiveSwapInterval(
    address _tokenA,
    address _tokenB,
    uint32 _activeInterval
  ) external {
    _activeSwapIntervals[_tokenA][_tokenB].add(_activeInterval);
  }

  function removeActiveSwapInterval(
    address _tokenA,
    address _tokenB,
    uint32 _activeInterval
  ) external {
    _activeSwapIntervals[_tokenA][_tokenB].remove(_activeInterval);
  }

  function setSwapAmountDelta(
    address _from,
    address _to,
    uint32 _swapInterval,
    uint32 _swap,
    int256 _value
  ) external {
    swapAmountDelta[_from][_to][_swapInterval][_swap] = _value;
  }

  function setAcummRatio(
    address _from,
    address _to,
    uint32 _swapInterval,
    uint32 _swap,
    uint256 _accumRatio
  ) external {
    accumRatio[_from][_to][_swapInterval][_swap] = _accumRatio;
  }

  function setPerformedSwaps(
    address _tokenA,
    address _tokenB,
    uint32 _swapInterval,
    uint32 _performedSwaps
  ) external {
    performedSwaps[_tokenA][_tokenB][_swapInterval] = _performedSwaps;
  }

  function getFeeFromAmount(uint32 _feeAmount, uint256 _amount) external pure returns (uint256) {
    return _getFeeFromAmount(_feeAmount, _amount);
  }
}
