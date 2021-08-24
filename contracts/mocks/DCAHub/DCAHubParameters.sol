// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.6;

import '../../DCAHub/DCAHubParameters.sol';

contract DCAHubParametersMock is DCAHubParameters {
  using EnumerableSet for EnumerableSet.UintSet;

  constructor(
    IDCAGlobalParameters _globalParameters,
    IERC20Metadata _tokenA,
    IERC20Metadata _tokenB
  ) DCAHubParameters(_globalParameters, _tokenA, _tokenB) {}

  // Mocks setters

  function magnitudeA() external view returns (uint256) {
    return _magnitudeA;
  }

  function magnitudeB() external view returns (uint256) {
    return _magnitudeB;
  }

  function internalBalanceOf(address _token) external view returns (uint256) {
    return _balances[_token];
  }

  function setInternalBalances(uint256 _amountTokenA, uint256 _amountTokenB) external {
    _balances[address(tokenA)] = _amountTokenA;
    _balances[address(tokenB)] = _amountTokenB;
  }

  function addActiveSwapInterval(uint32 _activeInterval) external {
    _activeSwapIntervals.add(_activeInterval);
  }

  function removeActiveSwapInterval(uint32 _activeInterval) external {
    _activeSwapIntervals.remove(_activeInterval);
  }

  function setSwapAmountDelta(
    uint32 _swapInterval,
    address _from,
    address _to,
    uint32 _swap,
    int256 _delta
  ) external {
    swapAmountDelta[_from][_to][_swapInterval][_swap] = _delta;
  }

  function setAcummRatesPerUnit(
    uint32 _swapInterval,
    address _from,
    address _to,
    uint32 _swap,
    uint256 _accumRatePerUnit
  ) external {
    _accumRatesPerUnit[_from][_to][_swapInterval][_swap] = _accumRatePerUnit;
  }

  function accumRatesPerUnit(
    uint32 _swapInterval,
    address _from,
    address _to,
    uint32 _swap
  ) external view returns (uint256) {
    return _accumRatesPerUnit[_from][_to][_swapInterval][_swap];
  }

  function setPerformedSwaps(uint32 _swapInterval, uint32 _performedSwaps) external {
    // TODO: stop using tokenA & tokenB and receive as parameters
    if (address(tokenA) < address(tokenB)) {
      performedSwaps[address(tokenA)][address(tokenB)][_swapInterval] = _performedSwaps;
    } else {
      performedSwaps[address(tokenB)][address(tokenA)][_swapInterval] = _performedSwaps;
    }
  }

  function setRatePerUnit(
    uint32 _swapInterval,
    address _from,
    address _to,
    uint32 _swap,
    uint256 _rate
  ) external {
    _accumRatesPerUnit[_from][_to][_swapInterval][_swap] = _rate;
  }

  function getFeeFromAmount(uint32 _feeAmount, uint256 _amount) external view returns (uint256) {
    return _getFeeFromAmount(_feeAmount, _amount);
  }

  function feePrecision() external view returns (uint24) {
    return _feePrecision;
  }
}
