// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import '../../DCAPair/DCAPairPositionHandler.sol';
import './DCAPairSwapHandler.sol';

contract DCAPairPositionHandlerMock is DCAPairPositionHandler, DCAPairParametersMock {
  constructor(
    IDCAFactory _factory,
    IERC20Detailed _tokenA,
    IERC20Detailed _tokenB
  ) DCAPairParametersMock(_factory, _tokenA, _tokenB) DCAPairPositionHandler(_tokenA, _tokenB) {
    /* */
  }

  // PositionHandler
  function deposit(
    address _tokenAddress,
    uint256 _rate,
    uint256 _amountOfSwaps
  ) public override {
    _deposit(_tokenAddress, _rate, _amountOfSwaps);
  }

  function withdrawSwapped(uint256 _dcaId) external override returns (uint256 _swapped, uint256 _fee) {
    (_swapped, _fee) = _withdrawSwapped(_dcaId);
  }

  function withdrawSwappedMany(uint256[] calldata _dcaIds)
    external
    override
    returns (
      uint256 _swappedTokenA,
      uint256 _tokenAFee,
      uint256 _swappedTokenB,
      uint256 _tokenBFee
    )
  {
    (_swappedTokenA, _tokenAFee, _swappedTokenB, _tokenBFee) = _withdrawSwappedMany(_dcaIds);
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

  function calculateSwapped(uint256 _dcaId) external view returns (uint256 _swapped, uint256 _fee) {
    (_swapped, _fee) = _calculateSwapped(_dcaId);
  }

  function addFundsToPosition(
    uint256 _dcaId,
    uint256 _amount,
    uint256 _newSwaps
  ) external override {
    _addFundsToPosition(_dcaId, _amount, _newSwaps);
  }
}
