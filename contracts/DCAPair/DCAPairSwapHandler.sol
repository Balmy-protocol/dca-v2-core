// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.6;
pragma abicoder v2;

import '@openzeppelin/contracts/security/ReentrancyGuard.sol';

import '../interfaces/IDCAPairSwapCallee.sol';
import '../libraries/CommonErrors.sol';

import './DCAPairParameters.sol';

abstract contract DCAPairSwapHandler is ReentrancyGuard, DCAPairParameters, IDCAPairSwapHandler {
  using SafeERC20 for IERC20Metadata;
  using EnumerableSet for EnumerableSet.UintSet;

  mapping(uint32 => mapping(address => uint256)) public override swapAmountAccumulator; // swap interval => from token => swap amount accum

  mapping(uint32 => uint32) public override nextSwapAvailable; // swap interval => timestamp

  function _addNewRatePerUnit(
    uint32 _swapInterval,
    address _address,
    uint32 _performedSwap,
    uint256 _ratePerUnit
  ) internal {
    uint256 _accumRatesPerUnitPreviousSwap = _accumRatesPerUnit[_swapInterval][_address][_performedSwap - 1];
    _accumRatesPerUnit[_swapInterval][_address][_performedSwap] = _accumRatesPerUnitPreviousSwap + _ratePerUnit;
  }

  function _registerSwap(
    uint32 _swapInterval,
    address _token,
    uint256 _internalAmountUsedToSwap,
    uint256 _ratePerUnit,
    uint32 _swapToRegister
  ) internal {
    swapAmountAccumulator[_swapInterval][_token] = _internalAmountUsedToSwap;
    _addNewRatePerUnit(_swapInterval, _token, _swapToRegister, _ratePerUnit);
    delete swapAmountDelta[_swapInterval][_token][_swapToRegister];
  }

  function _getAmountToSwap(
    uint32 _swapInterval,
    address _address,
    uint32 _swapToPerform
  ) internal view returns (uint256 _swapAmountAccumulator) {
    unchecked {
      _swapAmountAccumulator =
        swapAmountAccumulator[_swapInterval][_address] +
        uint256(swapAmountDelta[_swapInterval][_address][_swapToPerform]);
    }
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
      if (nextSwapAvailable[_swapInterval] <= _getTimestamp()) {
        uint32 _swapToPerform = performedSwaps[_swapInterval] + 1;
        _swapsToPerform[_amountOfSwapsToPerform++] = SwapInformation({
          interval: _swapInterval,
          swapToPerform: _swapToPerform,
          amountToSwapTokenA: _getAmountToSwap(_swapInterval, address(tokenA), _swapToPerform),
          amountToSwapTokenB: _getAmountToSwap(_swapInterval, address(tokenB), _swapToPerform)
        });
      }
    }
  }

  function secondsUntilNextSwap() external view override returns (uint32 _secondsUntil) {
    _secondsUntil = type(uint32).max;
    uint32 _timestamp = _getTimestamp();
    for (uint256 i; i < _activeSwapIntervals.length(); i++) {
      uint32 _swapInterval = uint32(_activeSwapIntervals.at(i));
      if (nextSwapAvailable[_swapInterval] <= _timestamp) {
        _secondsUntil = 0;
        break;
      } else {
        uint32 _diff = nextSwapAvailable[_swapInterval] - _timestamp;
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
        uint32 _swapToPerform = _nextSwapInformation.swapsToPerform[i].swapToPerform;
        if (_nextSwapInformation.swapsToPerform[i].amountToSwapTokenA > 0 || _nextSwapInformation.swapsToPerform[i].amountToSwapTokenB > 0) {
          _registerSwap(
            _swapInterval,
            address(tokenA),
            _nextSwapInformation.swapsToPerform[i].amountToSwapTokenA,
            _ratePerUnitAToBWithFee,
            _swapToPerform
          );
          _registerSwap(
            _swapInterval,
            address(tokenB),
            _nextSwapInformation.swapsToPerform[i].amountToSwapTokenB,
            _ratePerUnitBToAWithFee,
            _swapToPerform
          );
          performedSwaps[_swapInterval] = _swapToPerform;
          nextSwapAvailable[_swapInterval] = ((_timestamp / _swapInterval) + 1) * _swapInterval;
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
      IDCAPairSwapCallee(_to).DCAPairSwapCall(
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
}
