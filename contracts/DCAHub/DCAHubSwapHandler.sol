// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.6;
pragma abicoder v2;

import '@openzeppelin/contracts/security/ReentrancyGuard.sol';

import '../interfaces/IDCAHubSwapCallee.sol';
import '../libraries/CommonErrors.sol';
import './DCAHubParameters.sol';

abstract contract DCAHubSwapHandler is ReentrancyGuard, DCAHubParameters, IDCAHubSwapHandler {
  using SafeERC20 for IERC20Metadata;
  using EnumerableSet for EnumerableSet.UintSet;
  using PairSpecificConfig for mapping(address => mapping(address => mapping(uint32 => uint32)));

  function _registerSwap(
    address _tokenA,
    address _tokenB,
    uint32 _swapInterval,
    uint256 _ratePerUnitAToB,
    uint256 _ratePerUnitBToA,
    uint32 _timestamp
  ) internal virtual {
    uint32 _swapToRegister = performedSwaps.getValue(_tokenA, _tokenB, _swapInterval) + 1;
    _accumRatesPerUnit[_tokenA][_tokenB][_swapInterval][_swapToRegister] =
      _accumRatesPerUnit[_tokenA][_tokenB][_swapInterval][_swapToRegister - 1] +
      _ratePerUnitAToB;
    _accumRatesPerUnit[_tokenB][_tokenA][_swapInterval][_swapToRegister] =
      _accumRatesPerUnit[_tokenB][_tokenA][_swapInterval][_swapToRegister - 1] +
      _ratePerUnitBToA;
    swapAmountDelta[_tokenA][_tokenB][_swapInterval][_swapToRegister + 1] += swapAmountDelta[_tokenA][_tokenB][_swapInterval][_swapToRegister];
    swapAmountDelta[_tokenB][_tokenA][_swapInterval][_swapToRegister + 1] += swapAmountDelta[_tokenB][_tokenA][_swapInterval][_swapToRegister];
    delete swapAmountDelta[_tokenA][_tokenB][_swapInterval][_swapToRegister];
    delete swapAmountDelta[_tokenB][_tokenA][_swapInterval][_swapToRegister];
    // TODO: Investigate if sorting the tokens and accessing the mappings directly is more efficient
    performedSwaps.setValue(_tokenA, _tokenB, _swapInterval, _swapToRegister);
    nextSwapAvailable.setValue(_tokenA, _tokenB, _swapInterval, ((_timestamp / _swapInterval) + 1) * _swapInterval);
  }

  function _getAmountToSwap(
    address _tokenA,
    address _tokenB,
    uint32 _swapInterval
  ) internal view virtual returns (uint256 _amountToSwapTokenA, uint256 _amountToSwapTokenB) {
    uint32 _nextSwap = performedSwaps.getValue(_tokenA, _tokenB, _swapInterval) + 1;
    _amountToSwapTokenA = uint256(swapAmountDelta[_tokenA][_tokenB][_swapInterval][_nextSwap]);
    _amountToSwapTokenB = uint256(swapAmountDelta[_tokenB][_tokenA][_swapInterval][_nextSwap]);
  }

  function _convertTo(
    uint256 _fromTokenMagnitude,
    uint256 _amountFrom,
    uint256 _rateFromTo
  ) internal pure returns (uint256 _amountTo) {
    _amountTo = (_amountFrom * _rateFromTo) / _fromTokenMagnitude;
  }

  function _getNextSwapsToPerform() internal view virtual returns (SwapInformation[] memory _swapsToPerform, uint8 _amountOfSwapsToPerform) {
    uint256 _activeSwapIntervalsLength = _activeSwapIntervals.length();
    _swapsToPerform = new SwapInformation[](_activeSwapIntervalsLength);
    for (uint256 i; i < _activeSwapIntervalsLength; i++) {
      uint32 _swapInterval = uint32(_activeSwapIntervals.at(i));
      if (nextSwapAvailable.getValue(address(tokenA), address(tokenB), _swapInterval) <= _getTimestamp()) {
        uint32 _swapToPerform = performedSwaps.getValue(address(tokenA), address(tokenB), _swapInterval) + 1;
        (uint256 _amountToSwapTokenA, uint256 _amountToSwapTokenB) = _getAmountToSwap(address(tokenA), address(tokenB), _swapInterval);
        _swapsToPerform[_amountOfSwapsToPerform++] = SwapInformation({
          interval: _swapInterval,
          swapToPerform: _swapToPerform,
          amountToSwapTokenA: _amountToSwapTokenA,
          amountToSwapTokenB: _amountToSwapTokenB
        });
      }
    }
  }

  function secondsUntilNextSwap() external view override returns (uint32 _secondsUntil) {
    _secondsUntil = type(uint32).max;
    uint32 _timestamp = _getTimestamp();
    for (uint256 i; i < _activeSwapIntervals.length(); i++) {
      uint32 _swapInterval = uint32(_activeSwapIntervals.at(i));
      uint32 _nextAvailable = nextSwapAvailable.getValue(address(tokenA), address(tokenB), _swapInterval);
      if (_nextAvailable <= _timestamp) {
        _secondsUntil = 0;
        break;
      } else {
        uint32 _diff = _nextAvailable - _timestamp;
        if (_diff < _secondsUntil) {
          _secondsUntil = _diff;
        }
      }
    }
  }

  function getNextSwapInfo() external view override returns (NextSwapInformation memory _nextSwapInformation) {
    IDCAGlobalParameters.SwapParameters memory _swapParameters = globalParameters.swapParameters();
    (_nextSwapInformation, , ) = _getNextSwapInfo(_swapParameters.swapFee, _swapParameters.oracle);
  }

  function _getNextSwapInfo(uint32 _swapFee, ITimeWeightedOracle _oracle)
    internal
    view
    virtual
    returns (
      NextSwapInformation memory _nextSwapInformation,
      uint256 _ratePerUnitBToAWithFee,
      uint256 _ratePerUnitAToBWithFee
    )
  {
    uint256 _amountToSwapTokenA;
    uint256 _amountToSwapTokenB;
    {
      (SwapInformation[] memory _swapsToPerform, uint8 _amountOfSwaps) = _getNextSwapsToPerform();
      for (uint256 i; i < _amountOfSwaps; i++) {
        _amountToSwapTokenA += _swapsToPerform[i].amountToSwapTokenA;
        _amountToSwapTokenB += _swapsToPerform[i].amountToSwapTokenB;
      }
      _nextSwapInformation.swapsToPerform = _swapsToPerform;
      _nextSwapInformation.amountOfSwaps = _amountOfSwaps;
    }

    _nextSwapInformation.ratePerUnitBToA = _oracle.quote(address(tokenB), _magnitudeB, address(tokenA));
    _nextSwapInformation.ratePerUnitAToB = (uint256(_magnitudeB) * _magnitudeA) / _nextSwapInformation.ratePerUnitBToA;

    _ratePerUnitBToAWithFee = _nextSwapInformation.ratePerUnitBToA - _getFeeFromAmount(_swapFee, _nextSwapInformation.ratePerUnitBToA);
    _ratePerUnitAToBWithFee = _nextSwapInformation.ratePerUnitAToB - _getFeeFromAmount(_swapFee, _nextSwapInformation.ratePerUnitAToB);

    uint256 _finalNeededTokenA = _convertTo(_magnitudeB, _amountToSwapTokenB, _ratePerUnitBToAWithFee);
    uint256 _finalNeededTokenB = _convertTo(_magnitudeA, _amountToSwapTokenA, _ratePerUnitAToBWithFee);

    uint256 _amountOfTokenAIfTokenBSwapped = _convertTo(_magnitudeB, _amountToSwapTokenB, _nextSwapInformation.ratePerUnitBToA);
    if (_amountOfTokenAIfTokenBSwapped < _amountToSwapTokenA) {
      _nextSwapInformation.tokenToBeProvidedBySwapper = tokenB;
      _nextSwapInformation.tokenToRewardSwapperWith = tokenA;
      _nextSwapInformation.platformFeeTokenA = _getFeeFromAmount(_swapFee, _amountOfTokenAIfTokenBSwapped);
      _nextSwapInformation.platformFeeTokenB = _getFeeFromAmount(_swapFee, _amountToSwapTokenB);
      _nextSwapInformation.amountToBeProvidedBySwapper = _finalNeededTokenB + _nextSwapInformation.platformFeeTokenB - _amountToSwapTokenB;
      _nextSwapInformation.amountToRewardSwapperWith = _amountToSwapTokenA - _finalNeededTokenA - _nextSwapInformation.platformFeeTokenA;
      _nextSwapInformation.availableToBorrowTokenA = _balances[address(tokenA)] - _nextSwapInformation.amountToRewardSwapperWith;
      _nextSwapInformation.availableToBorrowTokenB = _balances[address(tokenB)];
    } else if (_amountOfTokenAIfTokenBSwapped > _amountToSwapTokenA) {
      _nextSwapInformation.tokenToBeProvidedBySwapper = tokenA;
      _nextSwapInformation.tokenToRewardSwapperWith = tokenB;
      _nextSwapInformation.platformFeeTokenA = _getFeeFromAmount(_swapFee, _amountToSwapTokenA);
      _nextSwapInformation.platformFeeTokenB = _getFeeFromAmount(
        _swapFee,
        (_amountToSwapTokenA * _magnitudeB) / _nextSwapInformation.ratePerUnitBToA
      );
      _nextSwapInformation.amountToBeProvidedBySwapper = _finalNeededTokenA + _nextSwapInformation.platformFeeTokenA - _amountToSwapTokenA;
      _nextSwapInformation.amountToRewardSwapperWith = _amountToSwapTokenB - _finalNeededTokenB - _nextSwapInformation.platformFeeTokenB;
      _nextSwapInformation.availableToBorrowTokenA = _balances[address(tokenA)];
      _nextSwapInformation.availableToBorrowTokenB = _balances[address(tokenB)] - _nextSwapInformation.amountToRewardSwapperWith;
    } else {
      _nextSwapInformation.platformFeeTokenA = _getFeeFromAmount(_swapFee, _amountToSwapTokenA);
      _nextSwapInformation.platformFeeTokenB = _getFeeFromAmount(_swapFee, _amountToSwapTokenB);
      _nextSwapInformation.availableToBorrowTokenA = _balances[address(tokenA)];
      _nextSwapInformation.availableToBorrowTokenB = _balances[address(tokenB)];
    }
  }

  function swap() external override {
    swap(0, 0, msg.sender, '');
  }

  function swap(
    uint256 _amountToBorrowTokenA,
    uint256 _amountToBorrowTokenB,
    address _to,
    bytes memory _data
  ) public override nonReentrant {
    IDCAGlobalParameters.SwapParameters memory _swapParameters = globalParameters.swapParameters();
    if (_swapParameters.isPaused) revert CommonErrors.Paused();

    NextSwapInformation memory _nextSwapInformation;

    {
      uint256 _ratePerUnitBToAWithFee;
      uint256 _ratePerUnitAToBWithFee;
      (_nextSwapInformation, _ratePerUnitBToAWithFee, _ratePerUnitAToBWithFee) = _getNextSwapInfo(
        _swapParameters.swapFee,
        _swapParameters.oracle
      );
      if (_nextSwapInformation.amountOfSwaps == 0) revert NoSwapsToExecute();

      uint32 _timestamp = _getTimestamp();
      for (uint256 i; i < _nextSwapInformation.amountOfSwaps; i++) {
        uint32 _swapInterval = _nextSwapInformation.swapsToPerform[i].interval;
        if (_nextSwapInformation.swapsToPerform[i].amountToSwapTokenA > 0 || _nextSwapInformation.swapsToPerform[i].amountToSwapTokenB > 0) {
          _registerSwap(address(tokenA), address(tokenB), _swapInterval, _ratePerUnitAToBWithFee, _ratePerUnitBToAWithFee, _timestamp);
        } else {
          _activeSwapIntervals.remove(_swapInterval);
        }
      }
    }

    if (
      _amountToBorrowTokenA > _nextSwapInformation.availableToBorrowTokenA ||
      _amountToBorrowTokenB > _nextSwapInformation.availableToBorrowTokenB
    ) revert CommonErrors.InsufficientLiquidity();

    uint256 _finalAmountToHaveTokenA = _nextSwapInformation.availableToBorrowTokenA - _nextSwapInformation.platformFeeTokenA;
    uint256 _finalAmountToHaveTokenB = _nextSwapInformation.availableToBorrowTokenB - _nextSwapInformation.platformFeeTokenB;

    {
      // scope for _amountToSendToken{A,B}, avoids stack too deep errors
      uint256 _amountToSendTokenA = _amountToBorrowTokenA;
      uint256 _amountToSendTokenB = _amountToBorrowTokenB;

      if (_nextSwapInformation.tokenToRewardSwapperWith == tokenA) {
        _amountToSendTokenA += _nextSwapInformation.amountToRewardSwapperWith;
        _finalAmountToHaveTokenB += _nextSwapInformation.amountToBeProvidedBySwapper;
      } else {
        _amountToSendTokenB += _nextSwapInformation.amountToRewardSwapperWith;
        _finalAmountToHaveTokenA += _nextSwapInformation.amountToBeProvidedBySwapper;
      }

      // Optimistically transfer tokens
      if (_amountToSendTokenA > 0) tokenA.safeTransfer(_to, _amountToSendTokenA);
      if (_amountToSendTokenB > 0) tokenB.safeTransfer(_to, _amountToSendTokenB);
    }

    if (_data.length > 0) {
      // Make call
      IDCAHubSwapCallee(_to).DCAHubSwapCall(
        msg.sender,
        tokenA,
        tokenB,
        _amountToBorrowTokenA,
        _amountToBorrowTokenB,
        _nextSwapInformation.tokenToRewardSwapperWith == tokenA,
        _nextSwapInformation.amountToRewardSwapperWith,
        _nextSwapInformation.amountToBeProvidedBySwapper,
        _data
      );
    }

    uint256 _balanceTokenA = tokenA.balanceOf(address(this));
    uint256 _balanceTokenB = tokenB.balanceOf(address(this));

    // Make sure that they sent the tokens back
    if (
      _balanceTokenA < (_finalAmountToHaveTokenA + _nextSwapInformation.platformFeeTokenA) ||
      _balanceTokenB < (_finalAmountToHaveTokenB + _nextSwapInformation.platformFeeTokenB)
    ) revert CommonErrors.LiquidityNotReturned();

    // Update balances
    _balances[address(tokenA)] = _finalAmountToHaveTokenA;
    _balances[address(tokenB)] = _finalAmountToHaveTokenB;

    // Send fees and extra
    uint256 _toFeeRecipientTokenA = _balanceTokenA - _finalAmountToHaveTokenA;
    uint256 _toFeeRecipientTokenB = _balanceTokenB - _finalAmountToHaveTokenB;
    if (_toFeeRecipientTokenA > 0) tokenA.safeTransfer(_swapParameters.feeRecipient, _toFeeRecipientTokenA);
    if (_toFeeRecipientTokenB > 0) tokenB.safeTransfer(_swapParameters.feeRecipient, _toFeeRecipientTokenB);

    // Emit event
    emit Swapped(msg.sender, _to, _amountToBorrowTokenA, _amountToBorrowTokenB, _swapParameters.swapFee, _nextSwapInformation);
  }

  function _getTimestamp() internal view virtual returns (uint32 _blockTimestamp) {
    _blockTimestamp = uint32(block.timestamp);
  }

  function _getTotalAmountsToSwap(
    address _tokenA,
    address _tokenB,
    uint32[] memory _allowedSwapIntervals
  )
    internal
    view
    virtual
    returns (
      uint256 _totalAmountToSwapTokenA,
      uint256 _totalAmountToSwapTokenB,
      uint32[] memory _affectedIntervals
    )
  {
    uint8 _intervalCount;
    _affectedIntervals = new uint32[](_allowedSwapIntervals.length);
    for (uint256 i; i < _allowedSwapIntervals.length; i++) {
      uint32 _swapInterval = _allowedSwapIntervals[i];
      if (nextSwapAvailable.getValue(_tokenA, _tokenB, _swapInterval) <= _getTimestamp()) {
        (uint256 _amountToSwapTokenA, uint256 _amountToSwapTokenB) = _getAmountToSwap(_tokenA, _tokenB, _swapInterval);
        if (_amountToSwapTokenA > 0 || _amountToSwapTokenB > 0) {
          _affectedIntervals[_intervalCount++] = _swapInterval;
          _totalAmountToSwapTokenA += _amountToSwapTokenA;
          _totalAmountToSwapTokenB += _amountToSwapTokenB;
        }
      }
    }
  }

  // TODO: Check if using smaller uint sizes for ratios and magnitudes is cheaper
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
    returns (
      uint256 _ratioAToB,
      uint256 _ratioBToA,
      uint256 _ratioAToBWithFee,
      uint256 _ratioBToAWithFee
    )
  {
    _ratioBToA = _oracle.quote(_tokenB, uint128(_magnitudeB), _tokenA);
    _ratioAToB = (_magnitudeB * _magnitudeA) / _ratioBToA;

    _ratioAToBWithFee = _ratioAToB - _getFeeFromAmount(_swapFee, _ratioAToB);
    _ratioBToAWithFee = _ratioBToA - _getFeeFromAmount(_swapFee, _ratioBToA);
  }
}
