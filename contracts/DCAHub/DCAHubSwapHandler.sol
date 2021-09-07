// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.6;
pragma abicoder v2;

import '@openzeppelin/contracts/security/ReentrancyGuard.sol';

import '../interfaces/IDCAHubSwapCallee.sol';
import '../libraries/CommonErrors.sol';
import './utils/Math.sol';
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
    virtual
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

  struct PairIndexes {
    uint8 indexTokenA;
    uint8 indexTokenB;
  }

  struct SwapInfo {
    TokenInSwap[] tokens;
    PairInSwap[] pairs;
  }

  struct TokenInSwap {
    address token;
    uint256 reward;
    uint256 toProvide;
    uint256 platformFee;
  }

  struct PairInSwap {
    address tokenA;
    address tokenB;
    uint256 ratioAToB;
    uint256 ratioBToA;
    uint32[] intervalsInSwap;
  }

  // TODO: Explore if re-calculating the ratios with fee in swap is cheaper than passing them around
  struct RatioWithFee {
    uint256 ratioAToBWithFee;
    uint256 ratioBToAWithFee;
  }

  struct InternalTokenInfo {
    uint8 indexTokenA;
    uint8 indexTokenB;
    uint120 magnitudeA; // 36 decimals max amount supported
    uint120 magnitudeB; // 36 decimals max amount supported
  }

  // TODO: Check if using the "each pair's active intervals" approach is creaper
  function _getNextSwapInfo(
    address[] memory _tokens,
    PairIndexes[] memory _pairs,
    uint32 _swapFee,
    ITimeWeightedOracle _oracle,
    uint32[] memory _allowedSwapIntervals
  ) internal view virtual returns (SwapInfo memory _swapInformation, RatioWithFee[] memory _internalSwapInformation) {
    // TODO: Make sure that there are no repeated tokens in _tokens
    // TODO: Make sure that there are no repeted pairs in _pairs
    // TODO: Make sure that _indexTokenA != _indexTokenB for all pair indexes

    uint256[] memory _total = new uint256[](_tokens.length);
    uint256[] memory _needed = new uint256[](_tokens.length);
    _swapInformation.pairs = new PairInSwap[](_pairs.length);
    _internalSwapInformation = new RatioWithFee[](_pairs.length);

    for (uint256 i; i < _pairs.length; i++) {
      InternalTokenInfo memory _tokenInfo;
      _tokenInfo.indexTokenA = _pairs[i].indexTokenA;
      _tokenInfo.indexTokenB = _pairs[i].indexTokenB;
      _swapInformation.pairs[i].tokenA = _tokens[_tokenInfo.indexTokenA];
      _swapInformation.pairs[i].tokenB = _tokens[_tokenInfo.indexTokenB];
      _tokenInfo.magnitudeA = uint120(10**IERC20Metadata(_swapInformation.pairs[i].tokenA).decimals());
      _tokenInfo.magnitudeB = uint120(10**IERC20Metadata(_swapInformation.pairs[i].tokenB).decimals());
      // TODO: Check if it is cheaper to store magnitude for all tokens, instead of calculating it each time

      uint256 _amountToSwapTokenA;
      uint256 _amountToSwapTokenB;

      (_amountToSwapTokenA, _amountToSwapTokenB, _swapInformation.pairs[i].intervalsInSwap) = _getTotalAmountsToSwap(
        _swapInformation.pairs[i].tokenA,
        _swapInformation.pairs[i].tokenB,
        _allowedSwapIntervals
      );

      _total[_tokenInfo.indexTokenA] += _amountToSwapTokenA;
      _total[_tokenInfo.indexTokenB] += _amountToSwapTokenB;

      (
        _swapInformation.pairs[i].ratioAToB,
        _swapInformation.pairs[i].ratioBToA,
        _internalSwapInformation[i].ratioAToBWithFee,
        _internalSwapInformation[i].ratioBToAWithFee
      ) = _calculateRatio(
        _swapInformation.pairs[i].tokenA,
        _swapInformation.pairs[i].tokenB,
        _tokenInfo.magnitudeA,
        _tokenInfo.magnitudeB,
        _swapFee,
        _oracle
      );

      _needed[_tokenInfo.indexTokenA] += _convertTo(_tokenInfo.magnitudeB, _amountToSwapTokenB, _internalSwapInformation[i].ratioBToAWithFee);
      _needed[_tokenInfo.indexTokenB] += _convertTo(_tokenInfo.magnitudeA, _amountToSwapTokenA, _internalSwapInformation[i].ratioAToBWithFee);
    }

    _swapInformation.tokens = new TokenInSwap[](_tokens.length);

    for (uint256 i; i < _swapInformation.tokens.length; i++) {
      _swapInformation.tokens[i].token = _tokens[i];

      uint256 _neededWithFee = _needed[i];
      uint256 _totalBeingSwapped = _total[i];

      if (_neededWithFee > 0 || _totalBeingSwapped > 0) {
        // We are un-applying the fee here
        uint256 _neededWithoutFee = (_neededWithFee * _feePrecision * 100) / (_feePrecision * 100 - _swapFee);

        // We are calculating the CoW by finding the min between what's needed and what we already have. Then, we just calculate the fee for that
        int256 _platformFee = int256(_getFeeFromAmount(_swapFee, Math.min(_neededWithoutFee, _totalBeingSwapped)));

        // If diff is negative, we need tokens. If diff is positive, then we have more than is needed
        int256 _diff = int256(_totalBeingSwapped) - int256(_neededWithFee);

        // Instead of checking if diff is positive or not, we compare against the platform fee. This is to avoid any rounding issues
        if (_diff > _platformFee) {
          _swapInformation.tokens[i].reward = uint256(_diff - _platformFee);
        } else if (_diff < _platformFee) {
          _swapInformation.tokens[i].toProvide = uint256(_platformFee - _diff);
        }
        _swapInformation.tokens[i].platformFee = uint256(_platformFee);
      }
    }
  }

  struct NextSwapInfo {
    NextTokenInSwap[] tokens;
    PairInSwap[] pairs;
  }

  struct NextTokenInSwap {
    address token;
    uint256 reward;
    uint256 toProvide;
    uint256 availableToBorrow;
  }

  function getNextSwapInfo(address[] memory _tokens, PairIndexes[] memory _pairsToSwap)
    external
    view
    returns (NextSwapInfo memory _swapInformation)
  {
    IDCAGlobalParameters.SwapParameters memory _swapParameters = globalParameters.swapParameters();
    (SwapInfo memory _internalSwapInformation, ) = _getNextSwapInfo(
      _tokens,
      _pairsToSwap,
      _swapParameters.swapFee,
      _swapParameters.oracle,
      globalParameters.allowedSwapIntervals()
    );

    _swapInformation.pairs = _internalSwapInformation.pairs;
    _swapInformation.tokens = new NextTokenInSwap[](_internalSwapInformation.tokens.length);

    for (uint256 i; i < _internalSwapInformation.tokens.length; i++) {
      TokenInSwap memory _tokenInSwap = _internalSwapInformation.tokens[i];
      _swapInformation.tokens[i].token = _tokenInSwap.token;
      _swapInformation.tokens[i].reward = _tokenInSwap.reward;
      _swapInformation.tokens[i].toProvide = _tokenInSwap.toProvide;
      _swapInformation.tokens[i].availableToBorrow = _balances[_tokenInSwap.token] - _tokenInSwap.reward;
    }
  }
}
