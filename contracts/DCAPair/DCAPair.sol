// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;
pragma abicoder v2;

import './DCAPairParameters.sol';
import './DCAPairPositionHandler.sol';
import './DCAPairSwapHandler.sol';

interface IDCAPair is IDCAPairParameters, IDCAPairSwapHandler, IDCAPairPositionHandler {}

contract DCAPair is DCAPairParameters, DCAPairSwapHandler, DCAPairPositionHandler, IDCAPair {
  constructor(
    IERC20Detailed _tokenA,
    IERC20Detailed _tokenB,
    uint256 _swapInterval
  )
    DCAPairParameters(IDCAFactory(msg.sender), _tokenA, _tokenB)
    DCAPairSwapHandler(ISlidingOracle(address(0xe)), _swapInterval)
    DCAPairPositionHandler(_tokenA, _tokenB)
  {}

  // PositionHandler
  function deposit(
    address _token,
    uint256 _rate,
    uint256 _amountOfSwaps
  ) external override {
    _deposit(_token, _rate, _amountOfSwaps);
  }

  function withdrawSwapped(uint256 _dcaId) external override returns (uint256 _swapped) {
    _swapped = _withdrawSwapped(_dcaId);
  }

  function withdrawSwappedMany(uint256[] calldata _dcaIds) external override returns (uint256 _swappedTokenA, uint256 _swappedTokenB) {
    (_swappedTokenA, _swappedTokenB) = _withdrawSwappedMany(_dcaIds);
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

  function addFundsToPosition(
    uint256 _dcaId,
    uint256 _amount,
    uint256 _newSwaps
  ) external override {
    _addFundsToPosition(_dcaId, _amount, _newSwaps);
  }

  // Swap Handler
  function setOracle(ISlidingOracle _oracle) public override {
    _setOracle(_oracle);
  }

  function setSwapInterval(uint256 _swapInterval) public override {
    _setSwapInterval(_swapInterval);
  }

  function swap() public override {
    _swap(address(0), '');
  }

  function swap(address _to, bytes calldata _data) public override {
    _swap(_to, _data);
  }
}
