// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

import '../interfaces/IDCAPair.sol';
import '../interfaces/IDCAPairLoanCallee.sol';

contract DCAPairLoanCalleeMock is IDCAPairLoanCallee {
  struct LoanCall {
    address pair;
    address sender;
    IERC20Detailed tokenA;
    IERC20Detailed tokenB;
    uint256 amountBorrowedTokenA;
    uint256 amountBorrowedTokenB;
    uint256 feeTokenA;
    uint256 feeTokenB;
    bytes data;
  }

  uint256 private _initialBalanceA;
  uint256 private _initialBalanceB;
  LoanCall private _lastCall;
  bool private _returnAsExpected = true;
  uint256 private _amountToReturnTokenA;
  uint256 private _amountToReturnTokenB;

  constructor(uint256 __initialBalanceA, uint256 __initialBalanceB) {
    _initialBalanceA = __initialBalanceA;
    _initialBalanceB = __initialBalanceB;
  }

  // solhint-disable-next-line func-name-mixedcase
  function DCAPairLoanCall(
    address _sender,
    IERC20Detailed _tokenA,
    IERC20Detailed _tokenB,
    uint256 _amountBorrowedTokenA,
    uint256 _amountBorrowedTokenB,
    uint256 _feeTokenA,
    uint256 _feeTokenB,
    bytes calldata _data
  ) public override {
    require(_tokenA.balanceOf(address(this)) == _initialBalanceA + _amountBorrowedTokenA, 'DCAPairLoanCallee: token A not sent optimistically');
    require(_tokenB.balanceOf(address(this)) == _initialBalanceB + _amountBorrowedTokenB, 'DCAPairLoanCallee: token B not sent optimistically');

    _lastCall = LoanCall(msg.sender, _sender, _tokenA, _tokenB, _amountBorrowedTokenA, _amountBorrowedTokenB, _feeTokenA, _feeTokenB, _data);

    if (_returnAsExpected) {
      _tokenA.transfer(msg.sender, _amountBorrowedTokenA);
      _tokenB.transfer(msg.sender, _amountBorrowedTokenB);
    } else {
      _tokenA.transfer(msg.sender, _amountToReturnTokenA);
      _tokenB.transfer(msg.sender, _amountToReturnTokenB);
    }
  }

  function returnSpecificAmounts(uint256 __amountToReturnTokenA, uint256 __amountToReturnTokenB) public {
    _amountToReturnTokenA = __amountToReturnTokenA;
    _amountToReturnTokenB = __amountToReturnTokenB;
    _returnAsExpected = false;
  }

  function wasThereACall() public view returns (bool) {
    return _lastCall.pair != address(0);
  }

  function getLastCall() public view returns (LoanCall memory __lastCall) {
    __lastCall = _lastCall;
  }
}

contract ReentrantDCAPairLoanCalleeMock is IDCAPairLoanCallee {
  // solhint-disable-next-line func-name-mixedcase
  function DCAPairLoanCall(
    address,
    IERC20Detailed,
    IERC20Detailed,
    uint256,
    uint256,
    uint256,
    uint256,
    bytes calldata
  ) public override {
    IDCAPairLoanHandler(msg.sender).loan(0, 0, msg.sender, '');
  }
}
