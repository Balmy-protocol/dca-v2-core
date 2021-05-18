// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

import '../interfaces/IDCAPairSwapCallee.sol';

contract DCAPairSwapCalleeMock is IDCAPairSwapCallee {
  struct SwapCall {
    address pair;
    address sender;
    IERC20Detailed rewardToken;
    uint256 rewardAmount;
    IERC20Detailed tokenToProvide;
    uint256 amountToProvide;
    bytes data;
  }

  // solhint-disable-next-line var-name-mixedcase
  uint256 private _INITIAL_BALANCE = 2 * 10**18;
  SwapCall private _lastCall;
  bool private _willProvideTokens = true;

  // solhint-disable-next-line func-name-mixedcase
  function DCAPairSwapCall(
    address _sender,
    IERC20Detailed _rewardToken,
    uint256 _rewardAmount,
    IERC20Detailed _tokenToProvide,
    uint256 _amountToProvide,
    bytes calldata _data
  ) public override {
    require(_rewardToken.balanceOf(address(this)) == _INITIAL_BALANCE + _rewardAmount, 'DCAPairSwapCallee: reward not sent optimistically');

    _lastCall = SwapCall(msg.sender, _sender, _rewardToken, _rewardAmount, _tokenToProvide, _amountToProvide, _data);

    if (_willProvideTokens) {
      _tokenToProvide.transfer(msg.sender, _amountToProvide);
    }
  }

  function dontProvideTokens() public {
    _willProvideTokens = false;
  }

  function wasThereACall() public view returns (bool) {
    return _lastCall.pair != address(0);
  }

  function getLastCall() public view returns (SwapCall memory __lastCall) {
    __lastCall = _lastCall;
  }
}
