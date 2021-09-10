// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.6;

import '@openzeppelin/contracts/security/ReentrancyGuard.sol';

import '../interfaces/IDCAHubSwapCallee.sol';
import '../libraries/CommonErrors.sol';
import './utils/Math.sol';
import './DCAHubParameters.sol';

abstract contract DCAHubSwapHandler is ReentrancyGuard, DCAHubParameters, IDCAHubSwapHandler {
  using SafeERC20 for IERC20Metadata;
  using EnumerableSet for EnumerableSet.UintSet;

  function _registerSwap(
    address _tokenA,
    address _tokenB,
    uint32 _swapInterval,
    uint256 _ratePerUnitAToB,
    uint256 _ratePerUnitBToA,
    uint32 _timestamp
  ) internal virtual {
    uint32 _swapToRegister = performedSwaps[_tokenA][_tokenB][_swapInterval] + 1;
    int256 _swappedTokenA = swapAmountDelta[_tokenA][_tokenB][_swapInterval][_swapToRegister];
    int256 _swappedTokenB = swapAmountDelta[_tokenB][_tokenA][_swapInterval][_swapToRegister];
    if (_swappedTokenA > 0 || _swappedTokenB > 0) {
      _accumRatesPerUnit[_tokenA][_tokenB][_swapInterval][_swapToRegister] =
        _accumRatesPerUnit[_tokenA][_tokenB][_swapInterval][_swapToRegister - 1] +
        _ratePerUnitAToB;
      _accumRatesPerUnit[_tokenB][_tokenA][_swapInterval][_swapToRegister] =
        _accumRatesPerUnit[_tokenB][_tokenA][_swapInterval][_swapToRegister - 1] +
        _ratePerUnitBToA;
      swapAmountDelta[_tokenA][_tokenB][_swapInterval][_swapToRegister + 1] += _swappedTokenA;
      swapAmountDelta[_tokenB][_tokenA][_swapInterval][_swapToRegister + 1] += _swappedTokenB;
      delete swapAmountDelta[_tokenA][_tokenB][_swapInterval][_swapToRegister];
      delete swapAmountDelta[_tokenB][_tokenA][_swapInterval][_swapToRegister];
      performedSwaps[_tokenA][_tokenB][_swapInterval] = _swapToRegister;
      nextSwapAvailable[_tokenA][_tokenB][_swapInterval] = ((_timestamp / _swapInterval) + 1) * _swapInterval;
    } else {
      _activeSwapIntervals[_tokenA][_tokenB].remove(_swapInterval);
    }
  }

  function _getAmountToSwap(
    address _tokenA,
    address _tokenB,
    uint32 _swapInterval
  ) internal view virtual returns (uint256 _amountToSwapTokenA, uint256 _amountToSwapTokenB) {
    uint32 _nextSwap = performedSwaps[_tokenA][_tokenB][_swapInterval] + 1;
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

  function secondsUntilNextSwap() external view override returns (uint32 _secondsUntil) {
    _secondsUntil = type(uint32).max;
    uint32 _timestamp = _getTimestamp();
    for (uint256 i; i < _activeSwapIntervals[address(tokenA)][address(tokenB)].length(); i++) {
      uint32 _swapInterval = uint32(_activeSwapIntervals[address(tokenA)][address(tokenB)].at(i));
      uint32 _nextAvailable = nextSwapAvailable[address(tokenA)][address(tokenB)][_swapInterval];
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
      uint32[] memory _intervalsInSwap
    )
  {
    uint8 _intervalCount;
    EnumerableSet.UintSet storage _swapIntervals = _activeSwapIntervals[_tokenA][_tokenB];
    _intervalsInSwap = new uint32[](_swapIntervals.length());
    for (uint256 i; i < _intervalsInSwap.length; i++) {
      uint32 _swapInterval = uint32(_swapIntervals.at(i));
      if (nextSwapAvailable[_tokenA][_tokenB][_swapInterval] <= _getTimestamp()) {
        (uint256 _amountToSwapTokenA, uint256 _amountToSwapTokenB) = _getAmountToSwap(_tokenA, _tokenB, _swapInterval);
        _intervalsInSwap[_intervalCount++] = _swapInterval;
        _totalAmountToSwapTokenA += _amountToSwapTokenA;
        _totalAmountToSwapTokenB += _amountToSwapTokenB;
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

  function _getNextSwapInfo(
    address[] memory _tokens,
    PairIndexes[] memory _pairs,
    uint32 _swapFee,
    ITimeWeightedOracle _oracle
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
        _swapInformation.pairs[i].tokenB
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
    (SwapInfo memory _internalSwapInformation, ) = _getNextSwapInfo(_tokens, _pairsToSwap, _swapParameters.swapFee, _swapParameters.oracle);

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

  event Swapped(address indexed sender, address indexed to, SwapInfo swapInformation, uint256[] borrowed, uint32 fee);

  function swap(address[] memory _tokens, PairIndexes[] memory _pairsToSwap) external {
    swap(_tokens, _pairsToSwap, new uint256[](_tokens.length), msg.sender, '');
  }

  function swap(
    address[] memory _tokens,
    PairIndexes[] memory _pairsToSwap,
    uint256[] memory _borrow,
    address _to,
    bytes memory _data
  ) public nonReentrant {
    IDCAGlobalParameters.SwapParameters memory _swapParameters = globalParameters.swapParameters();
    if (_swapParameters.isPaused) revert CommonErrors.Paused();

    SwapInfo memory _swapInformation;

    {
      RatioWithFee[] memory _internalSwapInformation;
      (_swapInformation, _internalSwapInformation) = _getNextSwapInfo(_tokens, _pairsToSwap, _swapParameters.swapFee, _swapParameters.oracle);
      // TODO: revert with 'NoSwapsToExecute' if there are no swaps being executed

      uint32 _timestamp = _getTimestamp();
      for (uint256 i; i < _swapInformation.pairs.length; i++) {
        for (uint256 j; j < _swapInformation.pairs[i].intervalsInSwap.length; j++) {
          if (_swapInformation.pairs[i].intervalsInSwap[j] == 0) {
            // Note: This is an optimization. If the interval is 0, we know there won't be any other intervals for this pair
            break;
          }
          _registerSwap(
            _swapInformation.pairs[i].tokenA,
            _swapInformation.pairs[i].tokenB,
            _swapInformation.pairs[i].intervalsInSwap[j],
            _internalSwapInformation[i].ratioAToBWithFee,
            _internalSwapInformation[i].ratioBToAWithFee,
            _timestamp
          );
        }
      }
    }

    // Optimistically transfer tokens
    for (uint256 i; i < _swapInformation.tokens.length; i++) {
      uint256 _amountToSend = _swapInformation.tokens[i].reward + _borrow[i];
      if (_amountToSend > 0) {
        // TODO: Think if we want to revert with a nicer message when there aren't enough funds, or if we just let it fail during transfer
        IERC20Metadata(_swapInformation.tokens[i].token).safeTransfer(_to, _amountToSend);
      }
    }

    if (_data.length > 0) {
      // Make call
      IDCAHubSwapCallee(_to).DCAHubSwapCall(msg.sender, _swapInformation.tokens, _borrow, _data);
    }

    for (uint256 i; i < _swapInformation.tokens.length; i++) {
      uint256 _amountToHave = _balances[_swapInformation.tokens[i].token] +
        _swapInformation.tokens[i].toProvide -
        _swapInformation.tokens[i].reward;

      // TODO: Check if it's cheaper to avoid checking the balance for tokens that had nothing to provide and that weren't borrowed
      uint256 _currentBalance = IERC20Metadata(_swapInformation.tokens[i].token).balanceOf(address(this));

      // Make sure tokens were sent back
      if (_currentBalance < _amountToHave) {
        revert CommonErrors.LiquidityNotReturned();
      }

      // Update internal balance
      _balances[_swapInformation.tokens[i].token] = _amountToHave;

      // Update platform balance
      uint256 _extra = _swapInformation.tokens[i].platformFee + (_currentBalance - _amountToHave);
      platformBalance[_swapInformation.tokens[i].token] += _extra;
    }

    // Emit event
    emit Swapped(msg.sender, _to, _swapInformation, _borrow, _swapParameters.swapFee);
  }
}
