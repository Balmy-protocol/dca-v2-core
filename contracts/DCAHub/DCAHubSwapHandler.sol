// SPDX-License-Identifier: BUSL-1.1
pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/security/ReentrancyGuard.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/utils/math/Math.sol';
import '../interfaces/IDCAHubSwapCallee.sol';
import '../libraries/Intervals.sol';
import '../libraries/FeeMath.sol';
import './DCAHubConfigHandler.sol';

abstract contract DCAHubSwapHandler is ReentrancyGuard, DCAHubConfigHandler, IDCAHubSwapHandler {
  using SafeERC20 for IERC20Metadata;

  function _registerSwap(
    address _tokenA,
    address _tokenB,
    bytes1 _swapIntervalMask,
    uint256 _ratioAToB,
    uint256 _ratioBToA,
    uint32 _timestamp
  ) internal virtual {
    SwapData memory _swapDataMem = _swapData[_tokenA][_tokenB][_swapIntervalMask];
    if (_swapDataMem.nextAmountToSwapAToB > 0 || _swapDataMem.nextAmountToSwapBToA > 0) {
      AccumRatio memory _accumRatioMem = _accumRatio[_tokenA][_tokenB][_swapIntervalMask][_swapDataMem.performedSwaps];
      _accumRatio[_tokenA][_tokenB][_swapIntervalMask][_swapDataMem.performedSwaps + 1] = AccumRatio({
        accumRatioAToB: _accumRatioMem.accumRatioAToB + _ratioAToB,
        accumRatioBToA: _accumRatioMem.accumRatioBToA + _ratioBToA
      });
      SwapDelta memory _swapDeltaMem = _swapAmountDelta[_tokenA][_tokenB][_swapIntervalMask][_swapDataMem.performedSwaps + 2];
      _swapData[_tokenA][_tokenB][_swapIntervalMask] = SwapData({
        performedSwaps: _swapDataMem.performedSwaps + 1,
        lastSwappedAt: _timestamp,
        nextAmountToSwapAToB: _addDeltaToNextAmount(_swapDataMem.nextAmountToSwapAToB, _swapDeltaMem.swapDeltaAToB),
        nextAmountToSwapBToA: _addDeltaToNextAmount(_swapDataMem.nextAmountToSwapBToA, _swapDeltaMem.swapDeltaBToA)
      });
      delete _swapAmountDelta[_tokenA][_tokenB][_swapIntervalMask][_swapDataMem.performedSwaps + 2];
    } else {
      activeSwapIntervals[_tokenA][_tokenB] &= ~_swapIntervalMask;
    }
  }

  function _addDeltaToNextAmount(uint224 _nextAmountToSwap, int128 _swapDelta) internal pure returns (uint224) {
    return _swapDelta < 0 ? _nextAmountToSwap - uint128(-_swapDelta) : _nextAmountToSwap + uint128(_swapDelta);
  }

  function _convertTo(
    uint256 _fromTokenMagnitude,
    uint256 _amountFrom,
    uint256 _rateFromTo,
    uint32 _swapFee
  ) internal pure returns (uint256 _amountTo) {
    uint256 _numerator = (_amountFrom * FeeMath.substractFeeFromAmount(_swapFee, _rateFromTo));
    _amountTo = _numerator / _fromTokenMagnitude;
    // Note: we need to round up because we can't ask for less than what we actually need
    if (_numerator % _fromTokenMagnitude != 0) _amountTo++;
  }

  function _getTimestamp() internal view virtual returns (uint32 _blockTimestamp) {
    _blockTimestamp = uint32(block.timestamp);
  }

  function _getTotalAmountsToSwap(address _tokenA, address _tokenB)
    internal
    view
    virtual
    returns (
      uint256 _totalAmountToSwapTokenA,
      uint256 _totalAmountToSwapTokenB,
      bytes1 _intervalsInSwap
    )
  {
    bytes1 _activeIntervals = activeSwapIntervals[_tokenA][_tokenB];
    uint32 _blockTimestamp = _getTimestamp();
    bytes1 _mask = 0x01;
    while (_activeIntervals >= _mask && _mask > 0) {
      if (_activeIntervals & _mask == _mask) {
        SwapData memory _swapDataMem = _swapData[_tokenA][_tokenB][_mask];
        uint32 _swapInterval = Intervals.maskToInterval(_mask);
        if (((_swapDataMem.lastSwappedAt / _swapInterval) + 1) * _swapInterval > _blockTimestamp) {
          // Note: this 'break' is both an optimization and a search for more CoW. Since this loop starts with the smaller intervals, it is
          // highly unlikely that if a small interval can't be swapped, a bigger interval can. It could only happen when a position was just
          // created for a new swap interval. At the same time, by adding this check, we force intervals to be swapped together. Therefore
          // increasing the chance of CoW (Coincidence of Wants), and reducing the need for external funds.
          break;
        }
        _intervalsInSwap |= _mask;
        _totalAmountToSwapTokenA += _swapDataMem.nextAmountToSwapAToB;
        _totalAmountToSwapTokenB += _swapDataMem.nextAmountToSwapBToA;
      }
      _mask <<= 1;
    }

    if (_totalAmountToSwapTokenA == 0 && _totalAmountToSwapTokenB == 0) {
      // Note: if there are no tokens to swap, then we don't want to execute any swaps for this pair
      _intervalsInSwap = 0;
    }
  }

  function _calculateRatio(
    address _tokenA,
    address _tokenB,
    uint256 _magnitudeA,
    uint256 _magnitudeB,
    ITimeWeightedOracle _oracle
  ) internal view virtual returns (uint256 _ratioAToB, uint256 _ratioBToA) {
    _ratioBToA = _oracle.quote(_tokenB, uint128(_magnitudeB), _tokenA);
    _ratioAToB = (_magnitudeB * _magnitudeA) / _ratioBToA;
  }

  function getNextSwapInfo(address[] calldata _tokens, PairIndexes[] calldata _pairs)
    public
    view
    virtual
    returns (SwapInfo memory _swapInformation)
  {
    // Note: we are caching these variables in memory so we can read storage only once (it's cheaper that way)
    uint32 _swapFee = swapFee;
    ITimeWeightedOracle _oracle = oracle;

    uint256[] memory _total = new uint256[](_tokens.length);
    uint256[] memory _needed = new uint256[](_tokens.length);
    _swapInformation.pairs = new PairInSwap[](_pairs.length);

    for (uint256 i; i < _pairs.length; i++) {
      uint8 indexTokenA = _pairs[i].indexTokenA;
      uint8 indexTokenB = _pairs[i].indexTokenB;
      if (
        indexTokenA >= indexTokenB ||
        (i > 0 &&
          (indexTokenA < _pairs[i - 1].indexTokenA || (indexTokenA == _pairs[i - 1].indexTokenA && indexTokenB <= _pairs[i - 1].indexTokenB)))
      ) {
        // Note: this confusing condition verifies that the pairs are sorted, first by token A, and then by token B
        revert InvalidPairs();
      }

      _swapInformation.pairs[i].tokenA = _tokens[indexTokenA];
      _swapInformation.pairs[i].tokenB = _tokens[indexTokenB];
      uint120 _magnitudeA = _calculateMagnitude(_swapInformation.pairs[i].tokenA);
      uint120 _magnitudeB = _calculateMagnitude(_swapInformation.pairs[i].tokenB);

      uint256 _amountToSwapTokenA;
      uint256 _amountToSwapTokenB;

      (_amountToSwapTokenA, _amountToSwapTokenB, _swapInformation.pairs[i].intervalsInSwap) = _getTotalAmountsToSwap(
        _swapInformation.pairs[i].tokenA,
        _swapInformation.pairs[i].tokenB
      );

      _total[indexTokenA] += _amountToSwapTokenA;
      _total[indexTokenB] += _amountToSwapTokenB;

      (_swapInformation.pairs[i].ratioAToB, _swapInformation.pairs[i].ratioBToA) = _calculateRatio(
        _swapInformation.pairs[i].tokenA,
        _swapInformation.pairs[i].tokenB,
        _magnitudeA,
        _magnitudeB,
        _oracle
      );

      _needed[indexTokenA] += _convertTo(_magnitudeB, _amountToSwapTokenB, _swapInformation.pairs[i].ratioBToA, _swapFee);
      _needed[indexTokenB] += _convertTo(_magnitudeA, _amountToSwapTokenA, _swapInformation.pairs[i].ratioAToB, _swapFee);
    }

    _swapInformation.tokens = new TokenInSwap[](_tokens.length);

    for (uint256 i; i < _swapInformation.tokens.length; i++) {
      if (i > 0 && _tokens[i] <= _tokens[i - 1]) {
        revert IDCAHub.InvalidTokens();
      }

      _swapInformation.tokens[i].token = _tokens[i];

      uint256 _neededWithFee = _needed[i];
      uint256 _totalBeingSwapped = _total[i];

      if (_neededWithFee > 0 || _totalBeingSwapped > 0) {
        // We are un-applying the fee here
        uint256 _neededWithoutFee = FeeMath.unapplyFeeToAmount(_swapFee, _neededWithFee);

        // We are calculating the CoW by finding the min between what's needed and what we already have. Then, we just calculate the fee for that
        int256 _platformFee = int256(FeeMath.calculateFeeForAmount(_swapFee, Math.min(_neededWithoutFee, _totalBeingSwapped)));

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

  function swap(
    address[] calldata _tokens,
    PairIndexes[] calldata _pairsToSwap,
    uint256[] calldata _borrow,
    address _to,
    bytes calldata _data
  ) public nonReentrant whenNotPaused {
    SwapInfo memory _swapInformation;
    // Note: we are caching this variable in memory so we can read storage only once (it's cheaper that way)
    uint32 _swapFee = swapFee;

    {
      _swapInformation = getNextSwapInfo(_tokens, _pairsToSwap);

      uint32 _timestamp = _getTimestamp();
      bool _executedAPair;
      for (uint256 i; i < _swapInformation.pairs.length; i++) {
        bytes1 _intervalsInSwap = _swapInformation.pairs[i].intervalsInSwap;
        bytes1 _mask = 0x01;
        while (_intervalsInSwap >= _mask && _mask > 0) {
          if (_intervalsInSwap & _mask == _mask) {
            _registerSwap(
              _swapInformation.pairs[i].tokenA,
              _swapInformation.pairs[i].tokenB,
              _mask,
              FeeMath.substractFeeFromAmount(_swapFee, _swapInformation.pairs[i].ratioAToB),
              FeeMath.substractFeeFromAmount(_swapFee, _swapInformation.pairs[i].ratioBToA),
              _timestamp
            );
          }
          _mask <<= 1;
        }
        _executedAPair = _executedAPair || _intervalsInSwap > 0;
      }

      if (!_executedAPair) {
        revert NoSwapsToExecute();
      }
    }

    // Remember balances before callback
    uint256[] memory _beforeBalances = new uint256[](_swapInformation.tokens.length);
    for (uint256 i; i < _beforeBalances.length; i++) {
      if (_swapInformation.tokens[i].toProvide > 0 || _borrow[i] > 0) {
        _beforeBalances[i] = IERC20Metadata(_swapInformation.tokens[i].token).balanceOf(address(this));
      }
    }

    // Optimistically transfer tokens
    for (uint256 i; i < _swapInformation.tokens.length; i++) {
      uint256 _amountToSend = _swapInformation.tokens[i].reward + _borrow[i];
      if (_amountToSend > 0) {
        IERC20Metadata(_swapInformation.tokens[i].token).safeTransfer(_to, _amountToSend);
      }
    }

    // Make call
    IDCAHubSwapCallee(_to).DCAHubSwapCall(msg.sender, _swapInformation.tokens, _borrow, _data);

    // Checks and balance updates
    for (uint256 i; i < _swapInformation.tokens.length; i++) {
      uint256 _addToPlatformBalance = _swapInformation.tokens[i].platformFee;

      if (_swapInformation.tokens[i].toProvide > 0 || _borrow[i] > 0) {
        uint256 _amountToHave = _beforeBalances[i] + _swapInformation.tokens[i].toProvide - _swapInformation.tokens[i].reward;

        uint256 _currentBalance = IERC20Metadata(_swapInformation.tokens[i].token).balanceOf(address(this));

        // Make sure tokens were sent back
        if (_currentBalance < _amountToHave) {
          revert IDCAHub.LiquidityNotReturned();
        }

        // Any extra tokens that might have been received, are set as platform balance
        _addToPlatformBalance += (_currentBalance - _amountToHave);
      }

      // Update platform balance
      if (_addToPlatformBalance > 0) {
        platformBalance[_swapInformation.tokens[i].token] += _addToPlatformBalance;
      }
    }

    // Emit event
    emit Swapped(msg.sender, _to, _swapInformation, _borrow, _swapFee);
  }
}
