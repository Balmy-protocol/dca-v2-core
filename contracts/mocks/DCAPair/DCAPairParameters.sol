// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.4;

import '../../DCAPair/DCAPairParameters.sol';

contract DCAPairParametersMock is DCAPairParameters {
  using EnumerableSet for EnumerableSet.UintSet;

  constructor(
    IDCAGlobalParameters _globalParameters,
    IERC20Detailed _tokenA,
    IERC20Detailed _tokenB
  ) DCAPairParameters(_globalParameters, _tokenA, _tokenB) {}

  // Mocks setters

  function magnitudeA() public view returns (uint256) {
    return _magnitudeA;
  }

  function magnitudeB() public view returns (uint256) {
    return _magnitudeB;
  }

  function internalBalanceOf(address _token) public view returns (uint256) {
    return _balances[_token];
  }

  function setInternalBalances(uint256 _amountTokenA, uint256 _amountTokenB) public {
    _balances[address(tokenA)] = _amountTokenA;
    _balances[address(tokenB)] = _amountTokenB;
  }

  function addActiveSwapInterval(uint32 _activeInterval) public {
    _activeSwapIntervals.add(_activeInterval);
  }

  function removeActiveSwapInterval(uint32 _activeInterval) public {
    _activeSwapIntervals.remove(_activeInterval);
  }

  function activeSwapIntervals() external view returns (uint32[] memory __activeSwapIntervals) {
    uint256 _activeSwapIntervalsLength = _activeSwapIntervals.length();
    __activeSwapIntervals = new uint32[](_activeSwapIntervalsLength);
    for (uint256 i; i < _activeSwapIntervalsLength; i++) {
      __activeSwapIntervals[i] = uint32(_activeSwapIntervals.at(i));
    }
  }

  function setSwapAmountDelta(
    uint32 _swapInterval,
    address _tokenAddress,
    uint32 _swap,
    int256 _delta
  ) public {
    swapAmountDelta[_swapInterval][_tokenAddress][_swap] = _delta;
  }

  function setAcummRatesPerUnit(
    uint32 _swapInterval,
    address _tokenAddress,
    uint32 _swap,
    uint256 _accumRatePerUnit
  ) public {
    _accumRatesPerUnit[_swapInterval][_tokenAddress][_swap] = _accumRatePerUnit;
  }

  function accumRatesPerUnit(
    uint32 _swapInterval,
    address _tokenAddress,
    uint32 _swap
  ) public view returns (uint256) {
    return _accumRatesPerUnit[_swapInterval][_tokenAddress][_swap];
  }

  function setPerformedSwaps(uint32 _swapInterval, uint32 _performedSwaps) public {
    performedSwaps[_swapInterval] = _performedSwaps;
  }

  function setRatePerUnit(
    uint32 _swapInterval,
    address _tokenAddress,
    uint32 _swap,
    uint256 _rate
  ) public {
    _accumRatesPerUnit[_swapInterval][_tokenAddress][_swap] = _rate;
  }

  function getFeeFromAmount(uint32 _feeAmount, uint256 _amount) public view returns (uint256) {
    return _getFeeFromAmount(_feeAmount, _amount);
  }

  function feePrecision() public view returns (uint24) {
    return _feePrecision;
  }
}
