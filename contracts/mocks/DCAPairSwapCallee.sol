// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

import '@openzeppelin/contracts/utils/Address.sol';

import '../interfaces/IDCAPairSwapCallee.sol';
import '../interfaces/IDCAPair.sol';

contract DCAPairSwapCalleeMock is IDCAPairSwapCallee {
  struct SwapCall {
    address pair;
    address sender;
    IERC20Detailed tokenA;
    IERC20Detailed tokenB;
    uint256 amountBorrowedTokenA;
    uint256 amountBorrowedTokenB;
    bool isRewardTokenA;
    uint256 rewardAmount;
    uint256 amountToProvide;
    bytes data;
  }

  // solhint-disable-next-line var-name-mixedcase
  uint256 private _initialBalanceA;
  uint256 private _initialBalanceB;
  SwapCall private _lastCall;
  bool private _returnAsExpected = true;
  uint256 private _amountToReturnTokenA;
  uint256 private _amountToReturnTokenB;

  constructor(uint256 __initialBalanceA, uint256 __initialBalanceB) {
    _initialBalanceA = __initialBalanceA;
    _initialBalanceB = __initialBalanceB;
  }

  // solhint-disable-next-line func-name-mixedcase
  function DCAPairSwapCall(
    address _sender,
    IERC20Detailed _tokenA,
    IERC20Detailed _tokenB,
    uint256 _amountBorrowedTokenA,
    uint256 _amountBorrowedTokenB,
    bool _isRewardTokenA,
    uint256 _rewardAmount,
    uint256 _amountToProvide,
    bytes calldata _data
  ) public override {
    require(
      _tokenA.balanceOf(address(this)) == _initialBalanceA + _amountBorrowedTokenA + (_isRewardTokenA ? _rewardAmount : 0),
      'DCAPairSwapCallee: token A not sent optimistically'
    );
    require(
      _tokenB.balanceOf(address(this)) == _initialBalanceB + _amountBorrowedTokenB + (_isRewardTokenA ? 0 : _rewardAmount),
      'DCAPairSwapCallee: token B not sent optimistically'
    );

    _lastCall = SwapCall(
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

  function getLastCall() public view returns (SwapCall memory __lastCall) {
    __lastCall = _lastCall;
  }
}

contract ReentrantDCAPairSwapCalleeMock is IDCAPairSwapCallee {
  using Address for address;

  bytes internal _attack;

  function setAttack(bytes memory __attack) external {
    _attack = __attack;
  }

  // solhint-disable-next-line func-name-mixedcase
  function DCAPairSwapCall(
    address,
    IERC20Detailed,
    IERC20Detailed,
    uint256,
    uint256,
    bool,
    uint256,
    uint256,
    bytes calldata
  ) public override {
    (msg.sender).functionCall(_attack);
  }
}
