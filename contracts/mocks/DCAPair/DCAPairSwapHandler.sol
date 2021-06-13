// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;
pragma abicoder v2;

import '../../DCAPair/DCAPairSwapHandler.sol';
import './DCAPairParameters.sol';

contract DCAPairSwapHandlerMock is DCAPairSwapHandler, DCAPairParametersMock {
  uint32 private _customTimestamp;

  constructor(
    IERC20Detailed _token0,
    IERC20Detailed _token1,
    IDCAGlobalParameters _globalParameters,
    ISlidingOracle _oracle
  ) DCAPairParametersMock(_globalParameters, _token0, _token1) DCAPairSwapHandler(_oracle) {
    /* */
  }

  // SwapHandler

  function registerSwap(
    uint32 _swapInterval,
    address _token,
    uint256 _internalAmountUsedToSwap,
    uint256 _ratePerUnit,
    uint32 _swapToRegister
  ) public {
    _registerSwap(_swapInterval, _token, _internalAmountUsedToSwap, _ratePerUnit, _swapToRegister);
  }

  function getAmountToSwap(
    uint32 _swapInterval,
    address _tokenAddress,
    uint32 _swap
  ) public view returns (uint256) {
    return _getAmountToSwap(_swapInterval, _tokenAddress, _swap);
  }

  function setBlockTimestamp(uint32 _blockTimestamp) public {
    _customTimestamp = _blockTimestamp;
  }

  function _getTimestamp() internal view override returns (uint32 _blockTimestamp) {
    _blockTimestamp = (_customTimestamp > 0) ? _customTimestamp : super._getTimestamp();
  }

  // Mocks setters

  function addNewRatePerUnit(
    uint32 _swapInterval,
    address _tokenAddress,
    uint32 _swap,
    uint256 _ratePerUnit
  ) public {
    _addNewRatePerUnit(_swapInterval, _tokenAddress, _swap, _ratePerUnit);
  }

  function setSwapAmountAccumulator(
    uint32 _swapInterval,
    address _tokenAddress,
    uint256 _swapAmountAccumulator
  ) public {
    swapAmountAccumulator[_swapInterval][_tokenAddress] = _swapAmountAccumulator;
  }

  function setLastSwapPerformed(uint32 _swapInterval, uint32 _lastSwapPerformend) public {
    lastSwapPerformed[_swapInterval] = _lastSwapPerformend;
  }
}
