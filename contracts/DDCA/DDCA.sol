//SPDX-License-Identifier: Unlicense
pragma solidity 0.7.0;

import './DDCAProtocolParameters.sol';
import './DDCADepositable.sol';
import './DDCACancelable.sol';
import './DDCASwapHandler.sol';

interface IDDCA is 
  IDDCAProtocolParameters, 
  IDDCADepositable, 
  IDDCACancelable,
  IDDCASwapHandler {}

contract DDCA is
  DDCAProtocolParameters,
  DDCADepositable,
  DDCACancelable,
  DDCASwapHandler,
  IDDCA
{
  constructor(
    IERC20 _from,
    IERC20 _to,
    IUniswapV2Router02 _uniswap
  ) DDCAProtocolParameters(_from, _to, _uniswap) {
    /* */
  }

  // Depositable
  function deposit(
    uint256 _startDate,
    uint256 _endDate,
    uint256 _amountPerDay
  ) public override {
    _deposit(_startDate, _endDate, _amountPerDay);
  }

  // Cancelable
  function cancel() public override {
    _cancel();
  }

  // Swap Handler
  function swap() public override {
    _swap();
  }

  // Protocol parameters
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
