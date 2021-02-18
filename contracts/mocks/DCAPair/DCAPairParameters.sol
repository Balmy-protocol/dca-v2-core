// SPDX-License-Identifier: MIT

pragma solidity 0.7.0;

import '../../DCAPair/DCAPairParameters.sol';

contract DCAPairParametersMock is DCAPairParameters {
  constructor(
    IERC20Decimals _from,
    IERC20Decimals _to,
    IUniswapV2Router02 _uniswap
  ) DCAPairParameters(_from, _to, _uniswap) {}

  // Mocks setters

  function setFactory(IDCAFactory _factory) public {
    _setFactory(_factory);
  }

  function setFrom(IERC20Decimals _from) public {
    _setFrom(_from);
  }

  function setTo(IERC20Decimals _to) public {
    _setTo(_to);
  }

  function setUniswap(IUniswapV2Router02 _uniswap) public {
    _setUniswap(_uniswap);
  }

  function setSwapAmountDelta(uint256 _swap, int256 _delta) public {
    swapAmountDelta[_swap] = _delta;
  }

  function setAverageRatesPerUnit(uint256 _swap, uint256[2] memory _averageRatePerUnit) public {
    accumRatesPerUnit[_swap] = _averageRatePerUnit;
  }

  // Mocks getters

  function magnitude() public view returns (uint256) {
    return _magnitude;
  }
}
