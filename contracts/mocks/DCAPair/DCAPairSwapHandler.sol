// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;
pragma abicoder v2;

import '../../DCAPair/DCAPairSwapHandler.sol';
import './DCAPairParameters.sol';

contract DCAPairSwapHandlerMock is DCAPairSwapHandler, DCAPairParametersMock {
  uint32 private _customTimestamp;

  // Used to mock _getNextSwapsToPerform
  mapping(uint8 => SwapInformation) private _swapsToPerform;
  uint8 private _swapsToPerformLength;

  constructor(
    IERC20Detailed _token0,
    IERC20Detailed _token1,
    IDCAGlobalParameters _globalParameters,
    ISlidingOracle _oracle
  ) DCAPairParametersMock(_globalParameters, _token0, _token1) DCAPairSwapHandler(_oracle) {
    /* */
  }

  // SwapHandler

  function getNextSwapsToPerform() public view returns (SwapInformation[] memory, uint8) {
    return _getNextSwapsToPerform();
  }

  function _getNextSwapsToPerform() internal view override returns (SwapInformation[] memory _swapInformation, uint8 _amountOfSwaps) {
    if (_swapsToPerformLength > 0) {
      _swapInformation = new SwapInformation[](_swapsToPerformLength);
      _amountOfSwaps = _swapsToPerformLength;
      for (uint8 i; i < _amountOfSwaps; i++) {
        _swapInformation[i] = _swapsToPerform[i];
      }
    } else {
      return super._getNextSwapsToPerform();
    }
  }

  function setNextSwapsToPerform(SwapInformation[] calldata __swapsToPerform) public {
    for (uint8 i; i < __swapsToPerform.length; i++) {
      _swapsToPerform[i] = __swapsToPerform[i];
    }
    _swapsToPerformLength = uint8(__swapsToPerform.length);
  }

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

  function setNextSwapAvailable(uint32 _swapInterval, uint32 _nextSwapAvailable) public {
    nextSwapAvailable[_swapInterval] = _nextSwapAvailable;
  }
}
