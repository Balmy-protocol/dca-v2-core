//SPDX-License-Identifier: Unlicense
pragma solidity 0.7.0;

import './DCAPairParameters.sol';
import './DCAPairPositionHandler.sol';
import './DCAPairSwapHandler.sol';

interface IDCAPair is IDCAPairParameters, IDCAPairSwapHandler, IDCAPairPositionHandler {}

contract DCAPair is DCAPairParameters, DCAPairSwapHandler, DCAPairPositionHandler, IDCAPair {
  constructor(
    IERC20Decimals _tokenA,
    IERC20Decimals _tokenB,
    uint256 _swapInterval
  ) DCAPairParameters(_tokenA, _tokenB) DCAPairSwapHandler(IDCAFactory(msg.sender), ISlidingOracle(address(0xe)), _swapInterval) {}

  // PositionHandler
  function deposit(
    address _token,
    uint256 _rate,
    uint256 _amountOfSwaps
  ) external override {
    _deposit(_token, _rate, _amountOfSwaps);
  }

  function withdrawSwapped(uint256 _dcaId) external override returns (uint256 _swapped) {
    /* */
  }

  function withdrawSwappedMany(uint256[] calldata _dcaIds) external override returns (uint256 _swappedTokenA, uint256 _swappedTokenB) {
    (_swappedTokenA, _swappedTokenB) = _withdrawSwappedMany(_dcaIds);
  }

  function modifyRate(uint256 _dcaId, uint256 _newRate) external override {
    /* */
  }

  function modifySwaps(uint256 _dcaId, uint256 _newSwaps) external override {
    /* */
  }

  function modifyRateAndSwaps(
    uint256 _dcaId,
    uint256 _newRate,
    uint256 _newSwaps
  ) external override {
    /* */
  }

  function terminate(uint256 _dcaId) external override {
    /* */
  }

  // Swap Handler
  function setOracle(ISlidingOracle _oracle) public override {
    _setOracle(_oracle);
  }

  function setSwapInterval(uint256 _swapInterval) public override {
    _setSwapInterval(_swapInterval);
  }

  function swap() public override {
    _swap();
  }
}
