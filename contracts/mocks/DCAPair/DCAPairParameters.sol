// SPDX-License-Identifier: MIT

pragma solidity 0.7.0;

import '../../DCAPair/DCAPairParameters.sol';

contract DCAPairParametersMock is DCAPairParameters {
  constructor(IERC20Decimals _tokenA, IERC20Decimals _tokenB) DCAPairParameters(_tokenA, _tokenB) {}

  // Mocks setters

  function setFactory(IDCAFactory _factory) public {
    _setFactory(_factory);
  }

  function setTokenA(IERC20Decimals _tokenA) public {
    _setTokenA(_tokenA);
  }

  function setTokenB(IERC20Decimals _tokenB) public {
    _setTokenB(_tokenB);
  }

  function setSwapAmountDelta(
    address _tokenAddress,
    uint256 _swap,
    int256 _delta
  ) public {
    swapAmountDelta[_tokenAddress][_swap] = _delta;
  }

  function setAcummRatesPerUnit(
    address _tokenAddress,
    uint256 _swap,
    uint256[2] memory _accumRatePerUnit
  ) public {
    accumRatesPerUnit[_tokenAddress][_swap] = _accumRatePerUnit;
  }

  function setPerformedSwaps(uint256 _performedSwaps) public {
    performedSwaps = _performedSwaps;
  }

  function setRatePerUnit(
    address _tokenAddress,
    uint256 _swap,
    uint256 _rate,
    uint256 _rateMultiplier
  ) public {
    accumRatesPerUnit[_tokenAddress][_swap] = [_rate, _rateMultiplier];
  }

  function addNewRatePerUnit(
    address _tokenAddress,
    uint256 _swap,
    uint256 _ratePerUnit
  ) public {
    _addNewRatePerUnit(_tokenAddress, _swap, _ratePerUnit);
  }
}
