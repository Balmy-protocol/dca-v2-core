// SPDX-License-Identifier: MIT

pragma solidity 0.7.0;

import '../../DCAPair/DCAPairParameters.sol';

contract DCAPairParametersMock is DCAPairParameters {
  constructor(
    IERC20Decimals _tokenA,
    IERC20Decimals _tokenB,
    IUniswapV2Router02 _uniswap
  ) DCAPairParameters(_tokenA, _tokenB, _uniswap) {}

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

  function setUniswap(IUniswapV2Router02 _uniswap) public {
    _setUniswap(_uniswap);
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

  // Mocks getters

  function magnitude() public view returns (uint256) {
    return _magnitude;
  }
}
