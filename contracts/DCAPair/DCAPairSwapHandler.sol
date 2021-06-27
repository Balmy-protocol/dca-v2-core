// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.4;
pragma abicoder v2;

import '@openzeppelin/contracts/security/ReentrancyGuard.sol';

import '../interfaces/ISlidingOracle.sol';
import '../interfaces/IDCAPairSwapCallee.sol';
import '../libraries/CommonErrors.sol';

import './DCAPairParameters.sol';

abstract contract DCAPairSwapHandler is ReentrancyGuard, DCAPairParameters, IDCAPairSwapHandler {
  using SafeERC20 for IERC20Detailed;
  using EnumerableSet for EnumerableSet.UintSet;

  mapping(uint32 => mapping(address => uint256)) public override swapAmountAccumulator; // swap interval => from token => swap amount accum

  mapping(uint32 => uint32) public override nextSwapAvailable; // swap interval => timestamp
  ISlidingOracle public override oracle;

  constructor(ISlidingOracle _oracle) {
    if (address(_oracle) == address(0)) revert CommonErrors.ZeroAddress();
    oracle = _oracle;
  }

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
        _swapsToPerform[_amountOfSwapsToPerform] = SwapInformation({
          interval: _swapInterval,
          swapToPerform: _swapToPerform,
          amountToSwapTokenA: _getAmountToSwap(_swapInterval, address(tokenA), _swapToPerform),
          amountToSwapTokenB: _getAmountToSwap(_swapInterval, address(tokenB), _swapToPerform)
        });
        _amountOfSwapsToPerform++;
      }
    }
  }

  function getNextSwapInfo() public view override returns (NextSwapInformation memory _nextSwapInformation) {
    uint32 _swapFee = globalParameters.swapFee();
    _nextSwapInformation = _getNextSwapInfo(_swapFee);
  }

  function _getNextSwapInfo(uint32 _swapFee) internal view virtual returns (NextSwapInformation memory _nextSwapInformation) {
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
    // TODO: Instead of using current, it should use quote to get a moving average and not current?
    _nextSwapInformation.ratePerUnitBToA = oracle.current(address(tokenB), _magnitudeB, address(tokenA));
    _nextSwapInformation.ratePerUnitAToB = (_magnitudeB * _magnitudeA) / _nextSwapInformation.ratePerUnitBToA;

    uint256 _amountOfTokenAIfTokenBSwapped = _convertTo(_magnitudeB, _amountToSwapTokenB, _nextSwapInformation.ratePerUnitBToA);

    if (_amountOfTokenAIfTokenBSwapped < _amountToSwapTokenA) {
      _nextSwapInformation.tokenToBeProvidedBySwapper = tokenB;
      _nextSwapInformation.tokenToRewardSwapperWith = tokenA;
      uint256 _tokenASurplus = _amountToSwapTokenA - _amountOfTokenAIfTokenBSwapped;
      _nextSwapInformation.amountToBeProvidedBySwapper = _convertTo(_magnitudeA, _tokenASurplus, _nextSwapInformation.ratePerUnitAToB);
      _nextSwapInformation.amountToRewardSwapperWith = _tokenASurplus + _getFeeFromAmount(_swapFee, _tokenASurplus);
      _nextSwapInformation.platformFeeTokenA = _getFeeFromAmount(_swapFee, _amountOfTokenAIfTokenBSwapped);
      _nextSwapInformation.platformFeeTokenB = _getFeeFromAmount(_swapFee, _amountToSwapTokenB);
      _nextSwapInformation.availableToBorrowTokenA = _balances[address(tokenA)] - _nextSwapInformation.amountToRewardSwapperWith;
      _nextSwapInformation.availableToBorrowTokenB = _balances[address(tokenB)];
    } else if (_amountOfTokenAIfTokenBSwapped > _amountToSwapTokenA) {
      _nextSwapInformation.tokenToBeProvidedBySwapper = tokenA;
      _nextSwapInformation.tokenToRewardSwapperWith = tokenB;
      _nextSwapInformation.amountToBeProvidedBySwapper = _amountOfTokenAIfTokenBSwapped - _amountToSwapTokenA;
      uint256 _amountToBeProvidedConvertedToB = _convertTo(
        _magnitudeA,
        _nextSwapInformation.amountToBeProvidedBySwapper,
        _nextSwapInformation.ratePerUnitAToB
      );
      _nextSwapInformation.amountToRewardSwapperWith =
        _amountToBeProvidedConvertedToB +
        _getFeeFromAmount(_swapFee, _amountToBeProvidedConvertedToB);
      _nextSwapInformation.platformFeeTokenA = _getFeeFromAmount(_swapFee, _amountToSwapTokenA);
      _nextSwapInformation.platformFeeTokenB = _getFeeFromAmount(_swapFee, _amountToSwapTokenB - _amountToBeProvidedConvertedToB);
      _nextSwapInformation.availableToBorrowTokenA = _balances[address(tokenA)];
      _nextSwapInformation.availableToBorrowTokenB = _balances[address(tokenB)] - _nextSwapInformation.amountToRewardSwapperWith;
    } else {
      _nextSwapInformation.platformFeeTokenA = _getFeeFromAmount(_swapFee, _amountToSwapTokenA);
      _nextSwapInformation.platformFeeTokenB = _getFeeFromAmount(_swapFee, _amountToSwapTokenB);
      _nextSwapInformation.availableToBorrowTokenA = _balances[address(tokenA)];
      _nextSwapInformation.availableToBorrowTokenB = _balances[address(tokenB)];
    }
  }

  function swap() public override {
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
    NextSwapInformation memory _nextSwapInformation = _getNextSwapInfo(_swapParameters.swapFee);
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
          _nextSwapInformation.ratePerUnitAToB,
          _swapToPerform
        );
        _registerSwap(
          _swapInterval,
          address(tokenB),
          _nextSwapInformation.swapsToPerform[i].amountToSwapTokenB,
          _nextSwapInformation.ratePerUnitBToA,
          _swapToPerform
        );
        performedSwaps[_swapInterval] = _swapToPerform;
        nextSwapAvailable[_swapInterval] = ((_timestamp / _swapInterval) + 1) * _swapInterval;
      } else {
        _activeSwapIntervals.remove(_swapInterval);
      }
    }

    if (
      _amountToBorrowTokenA > _nextSwapInformation.availableToBorrowTokenA ||
      _amountToBorrowTokenB > _nextSwapInformation.availableToBorrowTokenB
    ) revert CommonErrors.InsufficientLiquidity();

    uint256 _amountToHaveTokenA = _nextSwapInformation.availableToBorrowTokenA;
    uint256 _amountToHaveTokenB = _nextSwapInformation.availableToBorrowTokenB;

    {
      // scope for _amountToSendToken{A,B}, avoids stack too deep errors
      uint256 _amountToSendTokenA = _amountToBorrowTokenA;
      uint256 _amountToSendTokenB = _amountToBorrowTokenB;

      if (_nextSwapInformation.tokenToRewardSwapperWith == tokenA) {
        _amountToSendTokenA += _nextSwapInformation.amountToRewardSwapperWith;
        _amountToHaveTokenB += _nextSwapInformation.amountToBeProvidedBySwapper;
      } else {
        _amountToSendTokenB += _nextSwapInformation.amountToRewardSwapperWith;
        _amountToHaveTokenA += _nextSwapInformation.amountToBeProvidedBySwapper;
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
    if (_balanceTokenA < _amountToHaveTokenA || _balanceTokenB < _amountToHaveTokenB) revert CommonErrors.LiquidityNotReturned();

    // Update balances
    _balances[address(tokenA)] = _balanceTokenA - _nextSwapInformation.platformFeeTokenA;
    _balances[address(tokenB)] = _balanceTokenB - _nextSwapInformation.platformFeeTokenB;

    // Send fees
    tokenA.safeTransfer(_swapParameters.feeRecipient, _nextSwapInformation.platformFeeTokenA);
    tokenB.safeTransfer(_swapParameters.feeRecipient, _nextSwapInformation.platformFeeTokenB);

    // Emit event
    emit Swapped(msg.sender, _to, _amountToBorrowTokenA, _amountToBorrowTokenB, _nextSwapInformation);
  }

  function _getTimestamp() internal view virtual returns (uint32 _blockTimestamp) {
    _blockTimestamp = uint32(block.timestamp);
  }
}
