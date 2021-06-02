// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

import '../interfaces/IDCAPairLoanCallee.sol';
import './DCAPairParameters.sol';

abstract contract DCAPairLoanHandler is DCAPairParameters, IDCAPairLoanHandler {
  using SafeERC20 for IERC20Detailed;

  function loan(
    uint256 _amountToBorrowTokenA,
    uint256 _amountToBorrowTokenB,
    address _to,
    bytes memory _data
  ) public override {
    require(_amountToBorrowTokenA > 0 || _amountToBorrowTokenB > 0, 'DCAPair: need to borrow smth');

    uint256 _beforeBalanceTokenA = _balances[address(tokenA)];
    uint256 _beforeBalanceTokenB = _balances[address(tokenB)];

    require(_amountToBorrowTokenA <= _beforeBalanceTokenA && _amountToBorrowTokenB <= _beforeBalanceTokenB, 'DCAPair: insufficient liquidity');

    // Calculate fees
    uint32 _loanFee = globalParameters.loanFee();
    uint256 _feeTokenA = _amountToBorrowTokenA > 0 ? _getFeeFromAmount(_loanFee, _amountToBorrowTokenA) : 0;
    uint256 _feeTokenB = _amountToBorrowTokenB > 0 ? _getFeeFromAmount(_loanFee, _amountToBorrowTokenB) : 0;

    if (_amountToBorrowTokenA > 0) tokenA.safeTransfer(_to, _amountToBorrowTokenA);
    if (_amountToBorrowTokenB > 0) tokenB.safeTransfer(_to, _amountToBorrowTokenB);

    // Make call
    IDCAPairLoanCallee(_to).DCAPairLoanCall(
      msg.sender,
      tokenA,
      tokenB,
      _amountToBorrowTokenA,
      _amountToBorrowTokenB,
      _feeTokenA,
      _feeTokenB,
      _data
    );

    uint256 _afterBalanceTokenA = tokenA.balanceOf(address(this));
    uint256 _afterBalanceTokenB = tokenB.balanceOf(address(this));

    // Make sure that they sent the tokens back
    require(
      _afterBalanceTokenA >= _beforeBalanceTokenA + _feeTokenA && _afterBalanceTokenB >= _beforeBalanceTokenB + _feeTokenB,
      'DCAPair: liquidity not returned'
    );

    // Update balances
    _balances[address(tokenA)] = _afterBalanceTokenA - _feeTokenA;
    _balances[address(tokenB)] = _afterBalanceTokenB - _feeTokenB;

    // Send fees
    address _feeRecipient = globalParameters.feeRecipient();
    tokenA.safeTransfer(_feeRecipient, _feeTokenA);
    tokenB.safeTransfer(_feeRecipient, _feeTokenB);

    // Emit event
    emit Loaned(msg.sender, _to, _amountToBorrowTokenA, _amountToBorrowTokenB, _loanFee);
  }
}
