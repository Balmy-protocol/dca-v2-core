// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7 <0.9.0;

import '../../DCAHub/DCAHubSwapHandler.sol';
import './DCAHubConfigHandler.sol';

contract DCAHubSwapHandlerMock is DCAHubSwapHandler, DCAHubConfigHandlerMock {
  struct RegisterSwapCall {
    uint256 ratioAToB;
    uint256 ratioBToA;
    uint32 timestamp;
  }

  struct TotalAmountsToSwap {
    uint256 amountTokenA;
    uint256 amountTokenB;
    bytes1 intervalsInSwap;
  }

  mapping(address => mapping(address => mapping(bytes1 => RegisterSwapCall))) public registerSwapCalls; // token A => token B => swap interval => call

  mapping(address => mapping(address => uint256)) private _ratios; // from => to => ratio(from -> to)
  mapping(address => mapping(address => TotalAmountsToSwap)) private _totalAmountsToSwap; // tokenA => tokenB => total amounts

  SwapInfo private _swapInformation;
  uint32 private _customTimestamp;

  constructor(
    address _immediateGovernor,
    address _timeLockedGovernor,
    ITokenPriceOracle _oracle
  ) DCAHubConfigHandlerMock(_immediateGovernor, _timeLockedGovernor, _oracle) DCAHubSwapHandler() {}

  function registerSwap(
    address _tokenA,
    address _tokenB,
    bytes1 _swapIntervalMask,
    uint256 _ratioAToB,
    uint256 _ratioBToA,
    uint32 _timestamp
  ) external {
    _registerSwap(_tokenA, _tokenB, _swapIntervalMask, _ratioAToB, _ratioBToA, _timestamp);
  }

  function setBlockTimestamp(uint32 _blockTimestamp) external {
    _customTimestamp = _blockTimestamp;
  }

  function _getTimestamp() internal view override returns (uint32 _blockTimestamp) {
    _blockTimestamp = (_customTimestamp > 0) ? _customTimestamp : super._getTimestamp();
  }

  function getTotalAmountsToSwap(
    address _tokenA,
    address _tokenB,
    bool _calculatePrivilegedAvailability
  )
    external
    view
    returns (
      uint256,
      uint256,
      bytes1
    )
  {
    return _getTotalAmountsToSwap(_tokenA, _tokenB, _calculatePrivilegedAvailability);
  }

  function _getTotalAmountsToSwap(
    address _tokenA,
    address _tokenB,
    bool _calculatePrivilegedAvailability
  )
    internal
    view
    override
    returns (
      uint256 _totalAmountTokenA,
      uint256 _totalAmountTokenB,
      bytes1 _affectedIntervals
    )
  {
    TotalAmountsToSwap memory _amounts = _totalAmountsToSwap[_tokenA][_tokenB];
    if (_amounts.amountTokenA == 0 && _amounts.amountTokenB == 0) {
      return super._getTotalAmountsToSwap(_tokenA, _tokenB, _calculatePrivilegedAvailability);
    }
    _totalAmountTokenA = _amounts.amountTokenA;
    _totalAmountTokenB = _amounts.amountTokenB;
    _affectedIntervals = _amounts.intervalsInSwap;
  }

  function getNextSwapInfo(
    address[] calldata _tokens,
    PairIndexes[] calldata _pairs,
    bool _calculatePrivilegedAvailability,
    bytes calldata _oracleData
  ) public view override returns (SwapInfo memory) {
    if (_swapInformation.tokens.length > 0) {
      return _swapInformation;
    } else {
      return super.getNextSwapInfo(_tokens, _pairs, _calculatePrivilegedAvailability, _oracleData);
    }
  }

  function calculateRatio(
    address _tokenA,
    address _tokenB,
    ITokenPriceOracle _oracle,
    bytes calldata _oracleData
  )
    external
    view
    returns (
      uint256,
      uint256,
      PairMagnitudes memory
    )
  {
    return _calculateRatio(_tokenA, _tokenB, _oracle, _oracleData);
  }

  function _calculateRatio(
    address _tokenA,
    address _tokenB,
    ITokenPriceOracle _oracle,
    bytes calldata _oracleData
  )
    internal
    view
    override
    returns (
      uint256 _ratioAToB,
      uint256 _ratioBToA,
      PairMagnitudes memory _magnitudes
    )
  {
    _ratioBToA = _ratios[_tokenB][_tokenA];
    if (_ratioBToA == 0) {
      return super._calculateRatio(_tokenA, _tokenB, _oracle, _oracleData);
    }
    _magnitudes.magnitudeA = tokenMagnitude[_tokenA];
    _magnitudes.magnitudeB = tokenMagnitude[_tokenB];
    _ratioAToB = (_magnitudes.magnitudeA * _magnitudes.magnitudeB) / _ratioBToA;
  }

  // Used to register calls
  function _registerSwap(
    address _tokenA,
    address _tokenB,
    bytes1 _swapInterval,
    uint256 _ratioAToB,
    uint256 _ratioBToA,
    uint32 _timestamp
  ) internal override {
    registerSwapCalls[_tokenA][_tokenB][_swapInterval] = RegisterSwapCall({ratioAToB: _ratioAToB, ratioBToA: _ratioBToA, timestamp: _timestamp});
    super._registerSwap(_tokenA, _tokenB, _swapInterval, _ratioAToB, _ratioBToA, _timestamp);
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
    uint256 _totalAmountTokenB,
    bytes1[] memory _intervalsInSwap
  ) external {
    _totalAmountsToSwap[_tokenA][_tokenB].amountTokenA = _totalAmountTokenA;
    _totalAmountsToSwap[_tokenA][_tokenB].amountTokenB = _totalAmountTokenB;
    bytes1 _intervalMask;

    for (uint256 i = 0; i < _intervalsInSwap.length; i++) {
      _intervalMask |= _intervalsInSwap[i];
    }
    _totalAmountsToSwap[_tokenA][_tokenB].intervalsInSwap = _intervalMask;
  }

  function setInternalGetNextSwapInfo(SwapInfo memory __swapInformation) external {
    for (uint256 i; i < __swapInformation.tokens.length; i++) {
      _swapInformation.tokens.push(__swapInformation.tokens[i]);
    }

    for (uint256 i; i < __swapInformation.pairs.length; i++) {
      _swapInformation.pairs.push(__swapInformation.pairs[i]);
    }
  }
}
