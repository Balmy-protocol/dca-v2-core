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
  mapping(address => mapping(address => uint256)) private _ratios; // from => to => ratio(from -> to)
  mapping(address => mapping(address => uint256[2])) private _totalAmountsToSwap; // tokenA => tokenB => total amoutns

  SwapInfo private _swapInformation;
  RatioWithFee[] private _internalSwapInformation;
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

  function _getNextSwapsToPerform() internal view override returns (SwapInformation[] memory __swapInformation, uint8 _amountOfSwaps) {
    if (_shouldMockGetNextSwapsToPerform) {
      __swapInformation = new SwapInformation[](_swapsToPerformLength);
      _amountOfSwaps = _swapsToPerformLength;
      for (uint8 i; i < _amountOfSwaps; i++) {
        __swapInformation[i] = _swapsToPerform[i];
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
    returns (
      uint256,
      uint256,
      uint32[] memory
    )
  {
    return _getTotalAmountsToSwap(_tokenA, _tokenB, _allowedSwapIntervals);
  }

  function _getTotalAmountsToSwap(
    address _tokenA,
    address _tokenB,
    uint32[] memory _allowedSwapIntervals
  )
    internal
    view
    override
    returns (
      uint256 _totalAmountTokenA,
      uint256 _totalAmountTokenB,
      uint32[] memory _affectedIntervals
    )
  {
    uint256[2] memory _amounts = _totalAmountsToSwap[_tokenA][_tokenB];
    if (_amounts[0] == 0 && _amounts[1] == 0) {
      return super._getTotalAmountsToSwap(_tokenA, _tokenB, _allowedSwapIntervals);
    }
    _totalAmountTokenA = _amounts[0];
    _totalAmountTokenB = _amounts[1];
    _affectedIntervals = _allowedSwapIntervals;
  }

  function internalGetNextSwapInfo(
    address[] memory _tokens,
    PairIndexes[] memory _pairs,
    uint32 _swapFee,
    ITimeWeightedOracle _oracle,
    uint32[] memory _allowedSwapIntervals
  ) external view returns (SwapInfo memory, RatioWithFee[] memory) {
    return _getNextSwapInfo(_tokens, _pairs, _swapFee, _oracle, _allowedSwapIntervals);
  }

  function _getNextSwapInfo(
    address[] memory _tokens,
    PairIndexes[] memory _pairs,
    uint32 _swapFee,
    ITimeWeightedOracle _oracle,
    uint32[] memory _allowedSwapIntervals
  ) internal view override returns (SwapInfo memory, RatioWithFee[] memory) {
    if (_swapInformation.tokens.length > 0) {
      return (_swapInformation, _internalSwapInformation);
    } else {
      return super._getNextSwapInfo(_tokens, _pairs, _swapFee, _oracle, _allowedSwapIntervals);
    }
  }

  function calculateRatio(
    address _tokenA,
    address _tokenB,
    uint256 _magnitudeA,
    uint256 _magnitudeB,
    uint32 _swapFee,
    ITimeWeightedOracle _oracle
  )
    external
    view
    returns (
      uint256,
      uint256,
      uint256,
      uint256
    )
  {
    return _calculateRatio(_tokenA, _tokenB, _magnitudeA, _magnitudeB, _swapFee, _oracle);
  }

  function _calculateRatio(
    address _tokenA,
    address _tokenB,
    uint256 _magnitudeA,
    uint256 _magnitudeB,
    uint32 _swapFee,
    ITimeWeightedOracle _oracle
  )
    internal
    view
    override
    returns (
      uint256 _ratioAToB,
      uint256 _ratioBToA,
      uint256 _ratioAToBWithFee,
      uint256 _ratioBToAWithFee
    )
  {
    _ratioBToA = _ratios[_tokenB][_tokenA];
    if (_ratioBToA == 0) {
      return super._calculateRatio(_tokenA, _tokenB, _magnitudeA, _magnitudeB, _swapFee, _oracle);
    }
    _ratioAToB = (_magnitudeA * _magnitudeB) / _ratioBToA;
    _ratioAToBWithFee = _ratioAToB - _getFeeFromAmount(_swapFee, _ratioAToB);
    _ratioBToAWithFee = _ratioBToA - _getFeeFromAmount(_swapFee, _ratioBToA);
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

  function setRatio(
    address _tokenA,
    address _tokenB,
    uint256 _ratioBToA
  ) external {
    _ratios[_tokenB][_tokenA] = _ratioBToA;
  }

  function setTotalAmountsToSwap(
    address _tokenA,
    address _tokenB,
    uint256 _totalAmountTokenA,
    uint256 _totalAmountTokenB
  ) external {
    _totalAmountsToSwap[_tokenA][_tokenB] = [_totalAmountTokenA, _totalAmountTokenB];
  }

  function setAmountToSwap(
    address _tokenA,
    address _tokenB,
    uint32 _swapInterval,
    uint256 _amountTokenA,
    uint256 _amountTokenB
  ) external {
    _amountToSwap[_tokenA][_tokenB][_swapInterval] = [_amountTokenA, _amountTokenB];
  }

  function setInternalGetNextSwapInfo(SwapInfo memory __swapInformation, RatioWithFee[] memory __internalSwapInformation) external {
    for (uint256 i; i < __swapInformation.tokens.length; i++) {
      _swapInformation.tokens.push(__swapInformation.tokens[i]);
    }

    for (uint256 i; i < __swapInformation.pairs.length; i++) {
      _swapInformation.pairs.push(__swapInformation.pairs[i]);
    }

    for (uint256 i; i < __internalSwapInformation.length; i++) {
      _internalSwapInformation.push(__internalSwapInformation[i]);
    }
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
