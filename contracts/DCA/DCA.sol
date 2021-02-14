//SPDX-License-Identifier: Unlicense
pragma solidity 0.7.0;

import "./DCAProtocolParameters.sol";
import "./DCAPositionHandler.sol";
import "./DCASwapHandler.sol";

interface IDCA is IDCAProtocolParameters, IDCASwapHandler, IDCAPositionHandler {}

contract DCA is DCAProtocolParameters, DCASwapHandler, DCAPositionHandler, IDCA {
  constructor(
    address _feeRecipient,
    IERC20 _from,
    IERC20 _to,
    IUniswapV2Router02 _uniswap,
    uint256 _swapInterval
  ) DCAProtocolParameters(_feeRecipient, _from, _to, _uniswap) DCASwapHandler(_swapInterval) {
    /* */
  }

  // PositionHandler
  function deposit(uint256 _rate, uint256 _amountOfSwaps) external override {
    _deposit(_rate, _amountOfSwaps);
  }

  function withdrawSwapped() external override returns (uint256 _swapped) {
    /* */
  }

  function modifyRate(uint256 _newRate) external override {
    /* */
  }

  function modifyRateAndSwaps(uint256 _newRate, uint256 _newSwaps) external override {
    /* */
  }

  function terminate() external override {
    /* */
  }

  // Swap Handler
  function setSwapInterval(uint256 _swapInterval) public override {
    _setSwapInterval(_swapInterval);
  }

  function swap() public override {
    _swap();
  }

  // Protocol parameters
  function setFeeRecipient(address _feeRecipient) public override {
    _setFeeRecipient(_feeRecipient);
  }

  function setFrom(IERC20 _from) public override {
    _setFrom(_from);
  }

  function setTo(IERC20 _from) public override {
    _setTo(_from);
  }

  function setUniswap(IUniswapV2Router02 _uniswap) public override {
    _setUniswap(_uniswap);
  }
}
