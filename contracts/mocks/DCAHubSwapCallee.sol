// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/utils/Address.sol';

import '../interfaces/IDCAHubSwapCallee.sol';
import '../interfaces/IDCAHub.sol';

contract DCAHubSwapCalleeMock is IDCAHubSwapCallee {
  struct SwapCall {
    address hub;
    address sender;
    IDCAHub.TokenInSwap[] tokens;
    uint256[] borrowed;
    bytes data;
  }

  mapping(address => uint256) private _initialBalance;
  mapping(address => uint256) private _amountToReturn;
  SwapCall private _lastCall;
  bool private _returnAsExpected = true;
  bool private _avoidRewardCheck = false;

  // solhint-disable-next-line func-name-mixedcase
  function DCAHubSwapCall(
    address _sender,
    IDCAHub.TokenInSwap[] calldata _tokens,
    uint256[] calldata _borrowed,
    bytes calldata _data
  ) external {
    if (!_avoidRewardCheck) {
      for (uint256 i; i < _tokens.length; i++) {
        require(
          IERC20Metadata(_tokens[i].token).balanceOf(address(this)) == _initialBalance[_tokens[i].token] + _borrowed[i] + _tokens[i].reward,
          'DCAHubSwapCallee: token not sent optimistically'
        );
      }
    }
    _lastCall.hub = msg.sender;
    _lastCall.sender = _sender;
    _lastCall.data = _data;

    for (uint256 i; i < _tokens.length; i++) {
      _lastCall.tokens.push(_tokens[i]);
      _lastCall.borrowed.push(_borrowed[i]);
    }

    for (uint256 i; i < _tokens.length; i++) {
      unchecked {
        _initialBalance[_tokens[i].token] += _returnAsExpected
          ? _tokens[i].reward - _tokens[i].toProvide
          : _borrowed[i] + _tokens[i].reward - _amountToReturn[_tokens[i].token];
      }
    }

    for (uint256 i; i < _tokens.length; i++) {
      uint256 _amount = _returnAsExpected ? _borrowed[i] + _tokens[i].toProvide : _amountToReturn[_tokens[i].token];
      IERC20Metadata(_tokens[i].token).transfer(msg.sender, _amount);
    }
  }

  function avoidRewardCheck() external {
    _avoidRewardCheck = true;
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

  function lastCall() external view returns (SwapCall memory) {
    return _lastCall;
  }
}

contract ReentrantDCAHubSwapCalleeMock is IDCAHubSwapCallee {
  using Address for address;

  bytes internal _attack;

  function setAttack(bytes memory __attack) external {
    _attack = __attack;
  }

  // solhint-disable-next-line func-name-mixedcase
  function DCAHubSwapCall(
    address,
    IDCAHub.TokenInSwap[] calldata,
    uint256[] calldata,
    bytes calldata
  ) external {
    (msg.sender).functionCall(_attack);
  }
}
