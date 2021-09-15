// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.6;

import '@openzeppelin/contracts/security/ReentrancyGuard.sol';

import '../interfaces/IDCAHubSwapCallee.sol';
import '../libraries/CommonErrors.sol';
import './utils/Math.sol';
import './DCAHubConfigHandler.sol';

abstract contract DCAHubSwapHandler is ReentrancyGuard, DCAHubConfigHandler, IDCAHubSwapHandler {
  using SafeERC20 for IERC20Metadata;
  using EnumerableSet for EnumerableSet.UintSet;

  function _registerSwap(
    address _tokenA,
    address _tokenB,
    uint32 _swapInterval,
    uint256 _ratioAToB,
    uint256 _ratioBToA,
    uint32 _timestamp
  ) internal virtual {
    uint32 _swapToRegister = performedSwaps[_tokenA][_tokenB][_swapInterval] + 1;
    int256 _swappedTokenA = swapAmountDelta[_tokenA][_tokenB][_swapInterval][_swapToRegister];
    int256 _swappedTokenB = swapAmountDelta[_tokenB][_tokenA][_swapInterval][_swapToRegister];
    if (_swappedTokenA > 0 || _swappedTokenB > 0) {
      accumRatio[_tokenA][_tokenB][_swapInterval][_swapToRegister] =
        accumRatio[_tokenA][_tokenB][_swapInterval][_swapToRegister - 1] +
        _ratioAToB;
      accumRatio[_tokenB][_tokenA][_swapInterval][_swapToRegister] =
        accumRatio[_tokenB][_tokenA][_swapInterval][_swapToRegister - 1] +
        _ratioBToA;
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
    uint256 _rateFromTo,
    uint32 _swapFee
  ) internal pure returns (uint256 _amountTo) {
    _amountTo = (_amountFrom * _applyFeeToAmount(_swapFee, _rateFromTo)) / _fromTokenMagnitude;
  }

  struct Pair {
    address tokenA;
    address tokenB;
  }

  function secondsUntilNextSwap(Pair[] calldata _pairs) external view returns (uint32[] memory _seconds) {
    _seconds = new uint32[](_pairs.length);
    uint32 _timestamp = _getTimestamp();
    for (uint256 i; i < _pairs.length; i++) {
      _seconds[i] = _pairs[i].tokenA < _pairs[i].tokenB
        ? _secondsUntilNextSwap(_pairs[i].tokenA, _pairs[i].tokenB, _timestamp)
        : _secondsUntilNextSwap(_pairs[i].tokenB, _pairs[i].tokenA, _timestamp);
    }
  }

  function _secondsUntilNextSwap(
    address _tokenA,
    address _tokenB,
    uint32 _timestamp
  ) internal view returns (uint32 _secondsUntil) {
    _secondsUntil = type(uint32).max;
    for (uint256 i; i < _activeSwapIntervals[_tokenA][_tokenB].length(); i++) {
      uint32 _swapInterval = uint32(_activeSwapIntervals[_tokenA][_tokenB].at(i));
      uint32 _nextAvailable = nextSwapAvailable[_tokenA][_tokenB][_swapInterval];
      if (_nextAvailable <= _timestamp) {
        return 0;
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

    // TODO: If _totalAmountToSwapTokenA == 0 && _totalAmountToSwapTokenB == 0, consider making _intervalsInSwap a length 0 array
  }

  // TODO: Check if using smaller uint sizes for ratios and magnitudes is cheaper
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

  error InvalidPairs();
  error InvalidTokens();

  function _getNextSwapInfo(address[] calldata _tokens, PairIndexes[] calldata _pairs)
    internal
    view
    virtual
    returns (SwapInfo memory _swapInformation)
  {
    // Note: we are caching these variables in memory so we can read storage only once (it's cheaper that way)
    uint32 _swapFee = swapFee;
    ITimeWeightedOracle _oracle = oracle;

    uint256[] memory _total = new uint256[](_tokens.length);
    uint256[] memory _needed = new uint256[](_tokens.length);
    uint128[] memory _magnitude = new uint128[](_tokens.length);
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
      if (_magnitude[indexTokenA] == 0) {
        _magnitude[indexTokenA] = uint128(10**IERC20Metadata(_swapInformation.pairs[i].tokenA).decimals());
      }
      if (_magnitude[indexTokenB] == 0) {
        _magnitude[indexTokenB] = uint128(10**IERC20Metadata(_swapInformation.pairs[i].tokenB).decimals());
      }

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
        _magnitude[indexTokenA],
        _magnitude[indexTokenB],
        _oracle
      );

      _needed[indexTokenA] += _convertTo(_magnitude[indexTokenB], _amountToSwapTokenB, _swapInformation.pairs[i].ratioBToA, _swapFee);
      _needed[indexTokenB] += _convertTo(_magnitude[indexTokenA], _amountToSwapTokenA, _swapInformation.pairs[i].ratioAToB, _swapFee);
    }

    _swapInformation.tokens = new TokenInSwap[](_tokens.length);

    for (uint256 i; i < _swapInformation.tokens.length; i++) {
      if (i > 0 && _tokens[i] <= _tokens[i - 1]) {
        revert InvalidTokens();
      }

      _swapInformation.tokens[i].token = _tokens[i];

      uint256 _neededWithFee = _needed[i];
      uint256 _totalBeingSwapped = _total[i];

      if (_neededWithFee > 0 || _totalBeingSwapped > 0) {
        // We are un-applying the fee here
        uint256 _neededWithoutFee = (_neededWithFee * FEE_PRECISION * 100) / (FEE_PRECISION * 100 - _swapFee);

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

  function getNextSwapInfo(address[] calldata _tokens, PairIndexes[] calldata _pairsToSwap)
    external
    view
    returns (NextSwapInfo memory _swapInformation)
  {
    SwapInfo memory _internalSwapInformation = _getNextSwapInfo(_tokens, _pairsToSwap);

    _swapInformation.pairs = _internalSwapInformation.pairs;
    _swapInformation.tokens = new NextTokenInSwap[](_internalSwapInformation.tokens.length);

    for (uint256 i; i < _internalSwapInformation.tokens.length; i++) {
      TokenInSwap memory _tokenInSwap = _internalSwapInformation.tokens[i];
      _swapInformation.tokens[i].token = _tokenInSwap.token;
      _swapInformation.tokens[i].reward = _tokenInSwap.reward;
      _swapInformation.tokens[i].toProvide = _tokenInSwap.toProvide;
      _swapInformation.tokens[i].availableToBorrow = _balances[_tokenInSwap.token] - _tokenInSwap.reward;
      // TODO: Decide if we also want to expose the platform fee
    }
  }

  event Swapped(address indexed sender, address indexed to, SwapInfo swapInformation, uint256[] borrowed, uint32 fee);

  function swap(address[] calldata _tokens, PairIndexes[] calldata _pairsToSwap) external {
    swap(_tokens, _pairsToSwap, new uint256[](_tokens.length), msg.sender, '');
  }

  function swap(
    address[] calldata _tokens,
    PairIndexes[] calldata _pairsToSwap,
    uint256[] memory _borrow,
    address _to,
    bytes memory _data
  ) public nonReentrant whenNotPaused {
    SwapInfo memory _swapInformation;
    // Note: we are caching this variable in memory so we can read storage only once (it's cheaper that way)
    uint32 _swapFee = swapFee;

    {
      _swapInformation = _getNextSwapInfo(_tokens, _pairsToSwap);

      uint32 _timestamp = _getTimestamp();
      bool _executedAPair;
      for (uint256 i; i < _swapInformation.pairs.length; i++) {
        uint256 j;
        while (j < _swapInformation.pairs[i].intervalsInSwap.length && _swapInformation.pairs[i].intervalsInSwap[j] > 0) {
          _registerSwap(
            _swapInformation.pairs[i].tokenA,
            _swapInformation.pairs[i].tokenB,
            _swapInformation.pairs[i].intervalsInSwap[j],
            _applyFeeToAmount(_swapFee, _swapInformation.pairs[i].ratioAToB),
            _applyFeeToAmount(_swapFee, _swapInformation.pairs[i].ratioBToA),
            _timestamp
          );
          j++;
        }
        _executedAPair = _executedAPair || j > 0;
      }

      if (!_executedAPair) {
        revert NoSwapsToExecute();
      }
    }

    // Optimistically transfer tokens
    for (uint256 i; i < _swapInformation.tokens.length; i++) {
      uint256 _amountToSend = _swapInformation.tokens[i].reward + _borrow[i];
      if (_amountToSend > 0) {
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
      _balances[_swapInformation.tokens[i].token] = _currentBalance;

      // Update platform balance
      platformBalance[_swapInformation.tokens[i].token] += _swapInformation.tokens[i].platformFee + (_currentBalance - _amountToHave);
    }

    // Emit event
    emit Swapped(msg.sender, _to, _swapInformation, _borrow, _swapFee);
  }
}
