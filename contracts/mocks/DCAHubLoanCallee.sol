// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/utils/Address.sol';

import '../interfaces/IDCAHubLoanCallee.sol';
import '../interfaces/IDCAHub.sol';

contract DCAHubLoanCalleeMock is IDCAHubLoanCallee {
  struct LoanCall {
    address hub;
    address sender;
    IDCAHub.AmountOfToken[] loan;
    uint32 loanFee;
    bytes data;
  }

  mapping(address => uint256) private _initialBalance;
  mapping(address => uint256) private _amountToReturn;
  LoanCall private _lastCall;
  bool private _returnAsExpected = true;

  // solhint-disable-next-line func-name-mixedcase
  function DCAHubLoanCall(
    address _sender,
    IDCAHub.AmountOfToken[] calldata _loan,
    uint32 _loanFee,
    bytes calldata _data
  ) external {
    for (uint256 i; i < _loan.length; i++) {
      require(
        IERC20Metadata(_loan[i].token).balanceOf(address(this)) == _initialBalance[_loan[i].token] + _loan[i].amount,
        'DCAHubLoanCallee: token not sent optimistically'
      );
    }
    _lastCall.hub = msg.sender;
    _lastCall.sender = _sender;
    _lastCall.loanFee = _loanFee;
    _lastCall.data = _data;

    for (uint256 i; i < _loan.length; i++) {
      _lastCall.loan.push(_loan[i]);
    }

    for (uint256 i; i < _loan.length; i++) {
      uint256 _amount = _returnAsExpected ? _loan[i].amount + _getFeeFromAmount(_loanFee, _loan[i].amount) : _amountToReturn[_loan[i].token];
      IERC20Metadata(_loan[i].token).transfer(msg.sender, _amount);
    }
  }

  function _getFeeFromAmount(uint32 _feeAmount, uint256 _amount) internal pure returns (uint256) {
    return (_amount * _feeAmount) / 10000 / 100;
  }

  function setInitialBalances(address[] calldata _tokens, uint256[] calldata _amounts) external {
    for (uint256 i; i < _tokens.length; i++) {
      _initialBalance[_tokens[i]] = _amounts[i];
    }
  }

  function returnSpecificAmounts(address[] calldata _tokens, uint256[] calldata _amounts) external {
    for (uint256 i; i < _tokens.length; i++) {
      _amountToReturn[_tokens[i]] = _amounts[i];
    }
    _returnAsExpected = false;
  }

  function lastCall() external view returns (LoanCall memory) {
    return _lastCall;
  }
}

contract ReentrantDCAHubLoanCalleeMock is IDCAHubLoanCallee {
  using Address for address;

  bytes internal _attack;

  function setAttack(bytes memory __attack) external {
    _attack = __attack;
  }

  // solhint-disable-next-line func-name-mixedcase
  function DCAHubLoanCall(
    address,
    IDCAHub.AmountOfToken[] calldata,
    uint32,
    bytes calldata
  ) external {
    (msg.sender).functionCall(_attack);
  }
}
