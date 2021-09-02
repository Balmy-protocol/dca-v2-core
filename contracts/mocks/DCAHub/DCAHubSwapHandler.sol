// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.6;
pragma abicoder v2;

import '../../DCAHub/DCAHubSwapHandler.sol';
import './DCAHubParameters.sol';

contract DCAHubSwapHandlerMock is DCAHubSwapHandler, DCAHubParametersMock {
  struct RegisterSwapCall {
    uint256 ratePerUnitAToB;
    uint256 ratePerUnitBToA;
    uint32 timestamp;
  }

  mapping(address => mapping(address => mapping(uint32 => RegisterSwapCall))) public registerSwapCalls; // token A => token B => swap interval => call

  mapping(address => mapping(address => mapping(uint32 => uint256[2]))) private _amountToSwap;
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
    address _tokenA,
    address _tokenB,
    uint32 _swapInterval,
    uint256 _ratePerUnitAToB,
    uint256 _ratePerUnitBToA,
    uint32 _timestamp
  ) external {
    _registerSwap(_tokenA, _tokenB, _swapInterval, _ratePerUnitAToB, _ratePerUnitBToA, _timestamp);
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

  function _getAmountToSwap(
    address _tokenA,
    address _tokenB,
    uint32 _swapInterval
  ) internal view override returns (uint256, uint256) {
    uint256[2] memory _amounts = _amountToSwap[_tokenA][_tokenB][_swapInterval];
    if (_amounts[0] == 0 && _amounts[1] == 0) {
      return super._getAmountToSwap(_tokenA, _tokenB, _swapInterval);
    } else {
      return (_amounts[0], _amounts[1]);
    }
  }

  function getTotalAmountsToSwap(
    address _tokenA,
    address _tokenB,
    uint32[] memory _allowedSwapIntervals
  )
    external
    view
    virtual
    returns (
      uint256 _totalAmountToSwapTokenA,
      uint256 _totalAmountToSwapTokenB,
      uint32[] memory _affectedIntervals
    )
  {
    (_totalAmountToSwapTokenA, _totalAmountToSwapTokenB, _affectedIntervals) = _getTotalAmountsToSwap(_tokenA, _tokenB, _allowedSwapIntervals);
  }

  // Used to register calls
  function _registerSwap(
    address _tokenA,
    address _tokenB,
    uint32 _swapInterval,
    uint256 _ratePerUnitAToB,
    uint256 _ratePerUnitBToA,
    uint32 _timestamp
  ) internal override {
    registerSwapCalls[_tokenA][_tokenB][_swapInterval] = RegisterSwapCall({
      ratePerUnitAToB: _ratePerUnitAToB,
      ratePerUnitBToA: _ratePerUnitBToA,
      timestamp: _timestamp
    });
    super._registerSwap(_tokenA, _tokenB, _swapInterval, _ratePerUnitAToB, _ratePerUnitBToA, _timestamp);
  }

  // Mocks setters

  function setAmountToSwap(
    address _tokenA,
    address _tokenB,
    uint32 _swapInterval,
    uint256 _amountTokenA,
    uint256 _amountTokenB
  ) external {
    _amountToSwap[_tokenA][_tokenB][_swapInterval] = [_amountTokenA, _amountTokenB];
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
