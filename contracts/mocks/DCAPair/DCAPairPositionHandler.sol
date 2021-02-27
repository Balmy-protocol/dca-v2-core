// SPDX-License-Identifier: MIT

pragma solidity 0.7.0;

import '../../DCAPair/DCAPairPositionHandler.sol';
import './DCAPairSwapHandler.sol';

contract DCAPairPositionHandlerMock is DCAPairPositionHandler, DCAPairSwapHandlerMock {
  constructor(
    IERC20Decimals _tokenA,
    IERC20Decimals _tokenB,
    IUniswapV2Router02 _uniswap,
    IDCAFactory _factory,
    uint256 _swapInterval
  ) DCAPairSwapHandlerMock(_tokenA, _tokenB, _uniswap, _factory, _swapInterval) {
    /* */
  }

  // PositionHandler
  function deposit(
    address _tokenAddress,
    uint256 _rate,
    uint256 _amountOfSwaps
  ) public override {
    _deposit(_tokenAddress, _rate, _amountOfSwaps);
  }

  function withdrawSwapped(uint256 _dcaId) external override returns (uint256 _swapped) {
    _swapped = _withdrawSwapped(_dcaId);
  }

  function modifyRate(uint256 _dcaId, uint256 _newRate) external override {
    _modifyRate(_dcaId, _newRate);
  }

  function modifySwaps(uint256 _dcaId, uint256 _newSwaps) external override {
    _modifySwaps(_dcaId, _newSwaps);
  }

  function modifyRateAndSwaps(
    uint256 _dcaId,
    uint256 _newRate,
    uint256 _newSwaps
  ) external override {
    _modifyRateAndSwaps(_dcaId, _newRate, _newSwaps);
  }

  function terminate(uint256 _dcaId) external override {
    _terminate(_dcaId);
  }
}
