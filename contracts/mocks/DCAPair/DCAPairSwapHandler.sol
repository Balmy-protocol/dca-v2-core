// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;
pragma abicoder v2;

import '../../DCAPair/DCAPairSwapHandler.sol';
import './DCAPairParameters.sol';

contract DCAPairSwapHandlerMock is DCAPairSwapHandler, DCAPairParametersMock {
  uint256 private _customTimestamp;

  constructor(
    IERC20Detailed _token0,
    IERC20Detailed _token1,
    IDCAGlobalParameters _globalParameters,
    ISlidingOracle _oracle,
    uint32 _swapInterval
  ) DCAPairParametersMock(_globalParameters, _token0, _token1) DCAPairSwapHandler(_oracle, _swapInterval) {
    /* */
  }

  // SwapHandler

  function registerSwap(
    address _token,
    uint256 _internalAmountUsedToSwap,
    uint256 _ratePerUnit,
    uint32 _swapToRegister
  ) public {
    _registerSwap(_token, _internalAmountUsedToSwap, _ratePerUnit, _swapToRegister);
  }

  function getAmountToSwap(address _tokenAddress, uint32 _swap) public view returns (uint256) {
    return _getAmountToSwap(_tokenAddress, _swap);
  }

  function setBlockTimestamp(uint256 _blockTimestamp) public {
    _customTimestamp = _blockTimestamp;
  }

  function _getTimestamp() internal view override returns (uint256 _blockTimestamp) {
    _blockTimestamp = (_customTimestamp > 0) ? _customTimestamp : super._getTimestamp();
  }

  // Mocks setters

  function addNewRatePerUnit(
    address _tokenAddress,
    uint32 _swap,
    uint256 _ratePerUnit
  ) public {
    _addNewRatePerUnit(_tokenAddress, _swap, _ratePerUnit);
  }

  function setSwapAmountAccumulator(address _tokenAddress, uint256 _swapAmountAccumulator) public {
    swapAmountAccumulator[_tokenAddress] = _swapAmountAccumulator;
  }

  function setLastSwapPerformed(uint256 _lastSwapPerformend) public {
    lastSwapPerformed = _lastSwapPerformend;
  }
}
