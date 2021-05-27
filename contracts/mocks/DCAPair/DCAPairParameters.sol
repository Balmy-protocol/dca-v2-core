// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import '../../DCAPair/DCAPairParameters.sol';

contract DCAPairParametersMock is DCAPairParameters {
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

  function setSwapAmountDelta(
    address _tokenAddress,
    uint32 _swap,
    int256 _delta
  ) public {
    swapAmountDelta[_tokenAddress][_swap] = _delta;
  }

  function setAcummRatesPerUnit(
    address _tokenAddress,
    uint32 _swap,
    uint256[2] memory _accumRatePerUnit
  ) public {
    _accumRatesPerUnit[_tokenAddress][_swap] = _accumRatePerUnit;
  }

  function accumRatesPerUnit(address _tokenAddress, uint32 _swap) public view returns (uint256[2] memory) {
    return _accumRatesPerUnit[_tokenAddress][_swap];
  }

  function setPerformedSwaps(uint32 _performedSwaps) public {
    performedSwaps = _performedSwaps;
  }

  function setRatePerUnit(
    address _tokenAddress,
    uint32 _swap,
    uint256 _rate,
    uint256 _rateMultiplier
  ) public {
    _accumRatesPerUnit[_tokenAddress][_swap] = [_rate, _rateMultiplier];
  }

  function getFeeFromAmount(uint256 _amount) public view returns (uint256) {
    return _getFeeFromAmount(_amount);
  }
}
