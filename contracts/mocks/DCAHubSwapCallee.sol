// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.6;

import '@openzeppelin/contracts/utils/Address.sol';

import '../interfaces/IDCAHubSwapCallee.sol';
import '../interfaces/IDCAHub.sol';

contract DCAHubSwapCalleeMock is IDCAHubSwapCallee {
  struct OldSwapCall {
    address pair;
    address sender;
    IERC20Metadata tokenA;
    IERC20Metadata tokenB;
    uint256 amountBorrowedTokenA;
    uint256 amountBorrowedTokenB;
    bool isRewardTokenA;
    uint256 rewardAmount;
    uint256 amountToProvide;
    bytes data;
  }

  struct SwapCall {
    address hub;
    address sender;
    IDCAHub.TokenInSwap[] tokens;
    uint256[] borrowed;
    bytes data;
  }

  mapping(address => uint256) private _initialBalance;
  mapping(address => uint256) private _amountToReturn;
  OldSwapCall private _lastOldCall;
  SwapCall private _lastCall;
  bool private _returnAsExpected = true;

  // solhint-disable-next-line func-name-mixedcase
  function DCAHubSwapCall(
    address _sender,
    IERC20Metadata _tokenA,
    IERC20Metadata _tokenB,
    uint256 _amountBorrowedTokenA,
    uint256 _amountBorrowedTokenB,
    bool _isRewardTokenA,
    uint256 _rewardAmount,
    uint256 _amountToProvide,
    bytes calldata _data
  ) external override {
    require(
      _tokenA.balanceOf(address(this)) == _initialBalance[address(_tokenA)] + _amountBorrowedTokenA + (_isRewardTokenA ? _rewardAmount : 0),
      'DCAHubSwapCallee: token A not sent optimistically'
    );
    require(
      _tokenB.balanceOf(address(this)) == _initialBalance[address(_tokenB)] + _amountBorrowedTokenB + (_isRewardTokenA ? 0 : _rewardAmount),
      'DCAHubSwapCallee: token B not sent optimistically'
    );

    _lastOldCall = OldSwapCall(
      msg.sender,
      _sender,
      _tokenA,
      _tokenB,
      _amountBorrowedTokenA,
      _amountBorrowedTokenB,
      _isRewardTokenA,
      _rewardAmount,
      _amountToProvide,
      _data
    );

    if (_returnAsExpected) {
      _tokenA.transfer(msg.sender, _amountBorrowedTokenA + (_isRewardTokenA ? 0 : _amountToProvide));
      _tokenB.transfer(msg.sender, _amountBorrowedTokenB + (_isRewardTokenA ? _amountToProvide : 0));
    } else {
      _tokenA.transfer(msg.sender, _amountToReturn[address(_tokenA)]);
      _tokenB.transfer(msg.sender, _amountToReturn[address(_tokenB)]);
    }
  }

  // solhint-disable-next-line func-name-mixedcase
  function DCAHubSwapCall(
    address _sender,
    IDCAHub.TokenInSwap[] calldata _tokens,
    uint256[] calldata _borrowed,
    bytes calldata _data
  ) external override {
    for (uint256 i; i < _tokens.length; i++) {
      require(
        IERC20Metadata(_tokens[i].token).balanceOf(address(this)) == _initialBalance[_tokens[i].token] + _borrowed[i] + _tokens[i].reward,
        'DCAHubSwapCallee: token not sent optimistically'
      );
    }
    _lastCall.hub = msg.sender;
    _lastCall.sender = _sender;
    _lastCall.data = _data;

    for (uint256 i; i < _tokens.length; i++) {
      _lastCall.tokens.push(_tokens[i]);
      _lastCall.borrowed.push(_borrowed[i]);
    }

    for (uint256 i; i < _tokens.length; i++) {
      uint256 _amount = _returnAsExpected ? _borrowed[i] + _tokens[i].toProvide : _amountToReturn[_tokens[i].token];
      IERC20Metadata(_tokens[i].token).transfer(msg.sender, _amount);
    }
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

  function wasThereACall() external view returns (bool) {
    return _lastOldCall.pair != address(0);
  }

  function lastCall() external view returns (SwapCall memory) {
    return _lastCall;
  }

  function getLastCall() external view returns (OldSwapCall memory __lastCall) {
    __lastCall = _lastOldCall;
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
    IERC20Metadata,
    IERC20Metadata,
    uint256,
    uint256,
    bool,
    uint256,
    uint256,
    bytes calldata
  ) external override {
    (msg.sender).functionCall(_attack);
  }

  // solhint-disable-next-line func-name-mixedcase
  function DCAHubSwapCall(
    address,
    IDCAHub.TokenInSwap[] calldata,
    uint256[] calldata,
    bytes calldata
  ) external override {
    (msg.sender).functionCall(_attack);
  }
}
