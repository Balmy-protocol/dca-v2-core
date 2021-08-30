// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.6;
pragma abicoder v2;

import '../../DCAHub/DCAHubSwapHandler.sol';
import './DCAHubParameters.sol';

contract DCAHubSwapHandlerMock is DCAHubSwapHandler, DCAHubParametersMock {
  struct AddNewRatePerUnitCall {
    address from;
    address to;
    uint32 swapInterval;
    uint32 swap;
    uint256 ratePerUnit;
  }

  struct RegisterSwapCall {
    uint32 swap;
    uint256 ratePerUnit;
  }

  AddNewRatePerUnitCall public addNewRatePerUnitCall;
  mapping(address => mapping(address => mapping(uint32 => RegisterSwapCall))) public registerSwapCalls; // from token => to token => swap interval => call

  uint32 private _customTimestamp;

  // Used to mock _getNextSwapsToPerform
  bool private _shouldMockGetNextSwapsToPerform = false;
  mapping(uint8 => SwapInformation) private _swapsToPerform;
  uint8 private _swapsToPerformLength;

  constructor(
    IERC20Metadata _tokenA,
    IERC20Metadata _tokenB,
    IDCAGlobalParameters _globalParameters
  ) DCAHubParametersMock(_globalParameters, _tokenA, _tokenB) DCAHubSwapHandler() {
    /* */
  }

  // SwapHandler

  function getNextSwapsToPerform() external view returns (SwapInformation[] memory, uint8) {
    return _getNextSwapsToPerform();
  }

  function _getNextSwapsToPerform() internal view override returns (SwapInformation[] memory _swapInformation, uint8 _amountOfSwaps) {
    if (_shouldMockGetNextSwapsToPerform) {
      _swapInformation = new SwapInformation[](_swapsToPerformLength);
      _amountOfSwaps = _swapsToPerformLength;
      for (uint8 i; i < _amountOfSwaps; i++) {
        _swapInformation[i] = _swapsToPerform[i];
      }
    } else {
      return super._getNextSwapsToPerform();
    }
  }

  function setNextSwapsToPerform(SwapInformation[] calldata __swapsToPerform) external {
    for (uint8 i; i < __swapsToPerform.length; i++) {
      _swapsToPerform[i] = __swapsToPerform[i];
    }
    _swapsToPerformLength = uint8(__swapsToPerform.length);
    _shouldMockGetNextSwapsToPerform = true;
  }

  function registerSwap(
    address _from,
    address _to,
    uint32 _swapInterval,
    uint256 _ratePerUnit,
    uint32 _swapToRegister
  ) external {
    _registerSwap(_from, _to, _swapInterval, _ratePerUnit, _swapToRegister);
  }

  function getAmountToSwap(
    address _from,
    address _to,
    uint32 _swapInterval
  ) external view returns (uint256, uint256) {
    return _getAmountToSwap(_from, _to, _swapInterval);
  }

  function setBlockTimestamp(uint32 _blockTimestamp) external {
    _customTimestamp = _blockTimestamp;
  }

  function _getTimestamp() internal view override returns (uint32 _blockTimestamp) {
    _blockTimestamp = (_customTimestamp > 0) ? _customTimestamp : super._getTimestamp();
  }

  // Used to register calls
  function _addNewRatePerUnit(
    uint32 _swapInterval,
    address _from,
    address _to,
    uint32 _swap,
    uint256 _ratePerUnit
  ) internal override {
    addNewRatePerUnitCall.from = _from;
    addNewRatePerUnitCall.to = _to;
    addNewRatePerUnitCall.swapInterval = _swapInterval;
    addNewRatePerUnitCall.swap = _swap;
    addNewRatePerUnitCall.ratePerUnit = _ratePerUnit;
    super._addNewRatePerUnit(_swapInterval, _from, _to, _swap, _ratePerUnit);
  }

  function _registerSwap(
    address _from,
    address _to,
    uint32 _swapInterval,
    uint256 _ratePerUnit,
    uint32 _swapToRegister
  ) internal override {
    registerSwapCalls[_from][_to][_swapInterval] = RegisterSwapCall({swap: _swapToRegister, ratePerUnit: _ratePerUnit});
    super._registerSwap(_from, _to, _swapInterval, _ratePerUnit, _swapToRegister);
  }

  // Mocks setters

  function addNewRatePerUnit(
    uint32 _swapInterval,
    address _from,
    address _to,
    uint32 _swap,
    uint256 _ratePerUnit
  ) external {
    _addNewRatePerUnit(_swapInterval, _from, _to, _swap, _ratePerUnit);
  }

  function setNextSwapAvailable(uint32 _swapInterval, uint32 _nextSwapAvailable) external {
    // TODO: stop using tokenA & tokenB and receive as parameters
    if (address(tokenA) < address(tokenB)) {
      nextSwapAvailable[address(tokenA)][address(tokenB)][_swapInterval] = _nextSwapAvailable;
    } else {
      nextSwapAvailable[address(tokenB)][address(tokenA)][_swapInterval] = _nextSwapAvailable;
    }
  }
}
