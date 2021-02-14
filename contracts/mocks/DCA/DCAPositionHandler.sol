// SPDX-License-Identifier: MIT

pragma solidity 0.7.0;

import "../../DCA/DCAPositionHandler.sol";
import "./DCASwapHandler.sol";

contract DCAPositionHandlerMock is DCAPositionHandler, DCASwapHandlerMock {
  constructor(
    address _feeRecipient,
    IERC20Decimals _from,
    IERC20Decimals _to,
    IUniswapV2Router02 _uniswap,
    uint256 _swapInterval
  ) DCASwapHandlerMock(_feeRecipient, _from, _to, _uniswap, _swapInterval) {
    /* */
  }

  // PositionHandler
  function deposit(uint256 _rate, uint256 _amountOfSwaps) public override {
    _deposit(_rate, _amountOfSwaps);
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
