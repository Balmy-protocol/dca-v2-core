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
        nextAmountToSwapAToB: _swapDataMem.nextAmountToSwapAToB - _swapDeltaMem.swapDeltaAToB,
        nextAmountToSwapBToA: _swapDataMem.nextAmountToSwapBToA - _swapDeltaMem.swapDeltaBToA
      });
      delete _swapAmountDelta[_tokenA][_tokenB][_swapIntervalMask][_swapDataMem.performedSwaps + 2];
    } else {
      activeSwapIntervals[_tokenA][_tokenB] &= ~_swapIntervalMask;
    }
  }

  function _convertTo(
    uint256 _fromTokenMagnitude,
    uint256 _amountFrom,
    uint256 _rateFromTo,
    uint32 _swapFee
  ) internal pure returns (uint256 _amountTo) {
    uint256 _numerator = (_amountFrom * FeeMath.subtractFeeFromAmount(_swapFee, _rateFromTo));
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
    IPriceOracle _oracle
  ) internal view virtual returns (uint256 _ratioAToB, uint256 _ratioBToA) {
    _ratioBToA = _oracle.quote(_tokenB, uint128(_magnitudeB), _tokenA);
    _ratioAToB = (_magnitudeB * _magnitudeA) / _ratioBToA;
  }

  /// @inheritdoc IDCAHubSwapHandler
  function getNextSwapInfo(address[] calldata _tokens, PairIndexes[] calldata _pairs)
    public
    view
    virtual
    returns (SwapInfo memory _swapInformation)
  {
    // Note: we are caching these variables in memory so we can read storage only once (it's cheaper that way)
    uint32 _swapFee = swapFee;
    IPriceOracle _oracle = oracle;

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

      PairInSwap memory _pairInSwap;
      _pairInSwap.tokenA = _tokens[indexTokenA];
      _pairInSwap.tokenB = _tokens[indexTokenB];
      uint120 _magnitudeA = _calculateMagnitude(_pairInSwap.tokenA);
      uint120 _magnitudeB = _calculateMagnitude(_pairInSwap.tokenB);

      uint256 _amountToSwapTokenA;
      uint256 _amountToSwapTokenB;

      (_amountToSwapTokenA, _amountToSwapTokenB, _pairInSwap.intervalsInSwap) = _getTotalAmountsToSwap(_pairInSwap.tokenA, _pairInSwap.tokenB);

      _total[indexTokenA] += _amountToSwapTokenA;
      _total[indexTokenB] += _amountToSwapTokenB;

      (_pairInSwap.ratioAToB, _pairInSwap.ratioBToA) = _calculateRatio(
        _pairInSwap.tokenA,
        _pairInSwap.tokenB,
        _magnitudeA,
        _magnitudeB,
        _oracle
      );

      _needed[indexTokenA] += _convertTo(_magnitudeB, _amountToSwapTokenB, _pairInSwap.ratioBToA, _swapFee);
      _needed[indexTokenB] += _convertTo(_magnitudeA, _amountToSwapTokenA, _pairInSwap.ratioAToB, _swapFee);

      _swapInformation.pairs[i] = _pairInSwap;
    }

    // Note: we are caching this variable in memory so we can read storage only once (it's cheaper that way)
    uint16 _platformFeeRatio = platformFeeRatio;

    _swapInformation.tokens = new TokenInSwap[](_tokens.length);
    for (uint256 i; i < _swapInformation.tokens.length; i++) {
      if (i > 0 && _tokens[i] <= _tokens[i - 1]) {
        revert IDCAHub.InvalidTokens();
      }

      TokenInSwap memory _tokenInSwap;
      _tokenInSwap.token = _tokens[i];

      uint256 _neededInSwap = _needed[i];
      uint256 _totalBeingSwapped = _total[i];

      if (_neededInSwap > 0 || _totalBeingSwapped > 0) {
        uint256 _totalFee = FeeMath.calculateSubtractedFee(_swapFee, _neededInSwap);

        int256 _platformFee = int256((_totalFee * _platformFeeRatio) / MAX_PLATFORM_FEE_RATIO);

        // If diff is negative, we need tokens. If diff is positive, then we have more than is needed
        int256 _diff = int256(_totalBeingSwapped) - int256(_neededInSwap);

        // Instead of checking if diff is positive or not, we compare against the platform fee. This is to avoid any rounding issues
        if (_diff > _platformFee) {
          _tokenInSwap.reward = uint256(_diff - _platformFee);
        } else if (_diff < _platformFee) {
          _tokenInSwap.toProvide = uint256(_platformFee - _diff);
        }
        _tokenInSwap.platformFee = uint256(_platformFee);
      }
      _swapInformation.tokens[i] = _tokenInSwap;
    }
  }

  /// @inheritdoc IDCAHubSwapHandler
  function swap(
    address[] calldata _tokens,
    PairIndexes[] calldata _pairsToSwap,
    address _rewardRecipient,
    address _callbackHandler,
    uint256[] calldata _borrow,
    bytes calldata _data
  ) public nonReentrant whenNotPaused returns (SwapInfo memory _swapInformation) {
    // Note: we are caching this variable in memory so we can read storage only once (it's cheaper that way)
    uint32 _swapFee = swapFee;

    {
      _swapInformation = getNextSwapInfo(_tokens, _pairsToSwap);

      uint32 _timestamp = _getTimestamp();
      bool _executedAPair;
      for (uint256 i; i < _swapInformation.pairs.length; i++) {
        PairInSwap memory _pairInSwap = _swapInformation.pairs[i];
        bytes1 _intervalsInSwap = _pairInSwap.intervalsInSwap;
        bytes1 _mask = 0x01;
        while (_intervalsInSwap >= _mask && _mask > 0) {
          if (_intervalsInSwap & _mask == _mask) {
            _registerSwap(
              _pairInSwap.tokenA,
              _pairInSwap.tokenB,
              _mask,
              FeeMath.subtractFeeFromAmount(_swapFee, _pairInSwap.ratioAToB),
              FeeMath.subtractFeeFromAmount(_swapFee, _pairInSwap.ratioBToA),
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

    uint256[] memory _beforeBalances = new uint256[](_swapInformation.tokens.length);
    for (uint256 i; i < _swapInformation.tokens.length; i++) {
      TokenInSwap memory _tokenInSwap = _swapInformation.tokens[i];
      uint256 _amountToBorrow = _borrow[i];

      // Remember balances before callback
      if (_tokenInSwap.toProvide > 0 || _amountToBorrow > 0) {
        _beforeBalances[i] = IERC20Metadata(_tokenInSwap.token).balanceOf(address(this));
      }

      // Optimistically transfer tokens
      if (_rewardRecipient == _callbackHandler) {
        uint256 _amountToSend = _tokenInSwap.reward + _amountToBorrow;
        if (_amountToSend > 0) {
          IERC20Metadata(_tokenInSwap.token).safeTransfer(_callbackHandler, _amountToSend);
        }
      } else {
        if (_tokenInSwap.reward > 0) {
          IERC20Metadata(_tokenInSwap.token).safeTransfer(_rewardRecipient, _tokenInSwap.reward);
        }
        if (_amountToBorrow > 0) {
          IERC20Metadata(_tokenInSwap.token).safeTransfer(_callbackHandler, _amountToBorrow);
        }
      }
    }

    // Make call
    IDCAHubSwapCallee(_callbackHandler).DCAHubSwapCall(msg.sender, _swapInformation.tokens, _borrow, _data);

    // Checks and balance updates
    for (uint256 i; i < _swapInformation.tokens.length; i++) {
      TokenInSwap memory _tokenInSwap = _swapInformation.tokens[i];
      uint256 _addToPlatformBalance = _tokenInSwap.platformFee;

      if (_tokenInSwap.toProvide > 0 || _borrow[i] > 0) {
        uint256 _amountToHave = _beforeBalances[i] + _tokenInSwap.toProvide - _tokenInSwap.reward;

        uint256 _currentBalance = IERC20Metadata(_tokenInSwap.token).balanceOf(address(this));

        // Make sure tokens were sent back
        if (_currentBalance < _amountToHave) {
          revert IDCAHub.LiquidityNotReturned();
        }

        // Any extra tokens that might have been received, are set as platform balance
        _addToPlatformBalance += (_currentBalance - _amountToHave);
      }

      // Update platform balance
      if (_addToPlatformBalance > 0) {
        platformBalance[_tokenInSwap.token] += _addToPlatformBalance;
      }
    }

    // Emit event
    emit Swapped(msg.sender, _rewardRecipient, _callbackHandler, _swapInformation, _borrow, _swapFee);
  }
}
