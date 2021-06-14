// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.4;
pragma abicoder v2;

import '@openzeppelin/contracts/security/ReentrancyGuard.sol';

import '../interfaces/ISlidingOracle.sol';
import '../interfaces/IDCAPairSwapCallee.sol';
import './DCAPairParameters.sol';

abstract contract DCAPairSwapHandler is ReentrancyGuard, DCAPairParameters, IDCAPairSwapHandler {
  using SafeERC20 for IERC20Detailed;

  uint32 internal constant _MINIMUM_SWAP_INTERVAL = 1 minutes;

  mapping(uint32 => mapping(address => uint256)) public override swapAmountAccumulator; // swap interval => from token => swap amount accum

  mapping(uint32 => uint32) public override lastSwapPerformed;
  ISlidingOracle public override oracle;

  constructor(ISlidingOracle _oracle) {
    require(address(_oracle) != address(0), 'DCAPair: zero address');
    oracle = _oracle;
  }

  function _addNewRatePerUnit(
    uint32 _swapInterval,
    address _address,
    uint32 _performedSwap,
    uint256 _ratePerUnit
  ) internal {
    uint32 _previousSwap = _performedSwap - 1;
    uint256[2] memory _accumRatesPerUnitPreviousSwap = _accumRatesPerUnit[_swapInterval][_address][_previousSwap];
    (bool _ok, uint256 _result) = Math.tryAdd(_accumRatesPerUnitPreviousSwap[0], _ratePerUnit);
    if (_ok) {
      _accumRatesPerUnit[_swapInterval][_address][_performedSwap] = [_result, _accumRatesPerUnitPreviousSwap[1]];
    } else {
      uint256 _missingUntilOverflow = type(uint256).max - _accumRatesPerUnitPreviousSwap[0];
      _accumRatesPerUnit[_swapInterval][_address][_performedSwap] = [
        _ratePerUnit - _missingUntilOverflow,
        _accumRatesPerUnitPreviousSwap[1] + 1
      ];
    }
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

  function _getNextSwapsToPerform() internal view returns (Swap[] memory _swapsToPerform) {
    // TODO: Make choice of swap intervals to execute in a clever way
    uint32[] memory _allowedSwapIntervals = globalParameters.allowedSwapIntervals();
    _swapsToPerform = new Swap[](_allowedSwapIntervals.length);
    for (uint16 i; i < _allowedSwapIntervals.length; i++) {
      uint32 _swapInterval = _allowedSwapIntervals[i];
      if (lastSwapPerformed[_swapInterval] / _swapInterval < _getTimestamp() / _swapInterval) {
        _swapsToPerform[i] = Swap({interval: _swapInterval, swapToPerform: performedSwaps[_swapInterval] + 1});
      }
    }
  }

  function getNextSwapInfo() public view override returns (NextSwapInformation memory _nextSwapInformation) {
    uint32 _swapFee = globalParameters.swapFee();
    _nextSwapInformation = _getNextSwapInfo(_swapFee);
  }

  function _getNextSwapInfo(uint32 _swapFee) internal view returns (NextSwapInformation memory _nextSwapInformation) {
    {
      Swap[] memory _swapsToPerform = _getNextSwapsToPerform();
      for (uint16 i; i < _swapsToPerform.length; i++) {
        // TODO: If zero amount ?
        _nextSwapInformation.amountToSwapTokenA += _getAmountToSwap(
          _swapsToPerform[i].interval,
          address(tokenA),
          _swapsToPerform[i].swapToPerform
        );
        _nextSwapInformation.amountToSwapTokenB += _getAmountToSwap(
          _swapsToPerform[i].interval,
          address(tokenB),
          _swapsToPerform[i].swapToPerform
        );
      }
      _nextSwapInformation.swapsToPerform = _swapsToPerform;
    }
    // TODO: Instead of using current, it should use quote to get a moving average and not current?
    _nextSwapInformation.ratePerUnitBToA = oracle.current(address(tokenB), _magnitudeB, address(tokenA));
    _nextSwapInformation.ratePerUnitAToB = (_magnitudeB * _magnitudeA) / _nextSwapInformation.ratePerUnitBToA;

    uint256 _amountOfTokenAIfTokenBSwapped =
      _convertTo(_magnitudeB, _nextSwapInformation.amountToSwapTokenB, _nextSwapInformation.ratePerUnitBToA);

    if (_amountOfTokenAIfTokenBSwapped < _nextSwapInformation.amountToSwapTokenA) {
      _nextSwapInformation.tokenToBeProvidedBySwapper = tokenB;
      _nextSwapInformation.tokenToRewardSwapperWith = tokenA;
      uint256 _tokenASurplus = _nextSwapInformation.amountToSwapTokenA - _amountOfTokenAIfTokenBSwapped;
      _nextSwapInformation.amountToBeProvidedBySwapper = _convertTo(_magnitudeA, _tokenASurplus, _nextSwapInformation.ratePerUnitAToB);
      _nextSwapInformation.amountToRewardSwapperWith = _tokenASurplus + _getFeeFromAmount(_swapFee, _tokenASurplus);
      _nextSwapInformation.platformFeeTokenA = _getFeeFromAmount(_swapFee, _amountOfTokenAIfTokenBSwapped);
      _nextSwapInformation.platformFeeTokenB = _getFeeFromAmount(_swapFee, _nextSwapInformation.amountToSwapTokenB);
      _nextSwapInformation.availableToBorrowTokenA = _balances[address(tokenA)] - _nextSwapInformation.amountToRewardSwapperWith;
      _nextSwapInformation.availableToBorrowTokenB = _balances[address(tokenB)];
    } else if (_amountOfTokenAIfTokenBSwapped > _nextSwapInformation.amountToSwapTokenA) {
      _nextSwapInformation.tokenToBeProvidedBySwapper = tokenA;
      _nextSwapInformation.tokenToRewardSwapperWith = tokenB;
      _nextSwapInformation.amountToBeProvidedBySwapper = _amountOfTokenAIfTokenBSwapped - _nextSwapInformation.amountToSwapTokenA;
      uint256 _amountToBeProvidedConvertedToB =
        _convertTo(_magnitudeA, _nextSwapInformation.amountToBeProvidedBySwapper, _nextSwapInformation.ratePerUnitAToB);
      _nextSwapInformation.amountToRewardSwapperWith =
        _amountToBeProvidedConvertedToB +
        _getFeeFromAmount(_swapFee, _amountToBeProvidedConvertedToB);
      _nextSwapInformation.platformFeeTokenA = _getFeeFromAmount(_swapFee, _nextSwapInformation.amountToSwapTokenA);
      _nextSwapInformation.platformFeeTokenB = _getFeeFromAmount(
        _swapFee,
        _nextSwapInformation.amountToSwapTokenB - _amountToBeProvidedConvertedToB
      );
      _nextSwapInformation.availableToBorrowTokenA = _balances[address(tokenA)];
      _nextSwapInformation.availableToBorrowTokenB = _balances[address(tokenB)] - _nextSwapInformation.amountToRewardSwapperWith;
    } else {
      _nextSwapInformation.platformFeeTokenA = _getFeeFromAmount(_swapFee, _nextSwapInformation.amountToSwapTokenA);
      _nextSwapInformation.platformFeeTokenB = _getFeeFromAmount(_swapFee, _nextSwapInformation.amountToSwapTokenB);
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
    require(!_swapParameters.isPaused, 'DCAPair: swaps are paused');
    NextSwapInformation memory _nextSwapInformation = _getNextSwapInfo(_swapParameters.swapFee);
    uint32 _swapInterval = _nextSwapInformation.swapsToPerform[0].interval;
    _registerSwap(
      _swapInterval,
      address(tokenA),
      _nextSwapInformation.amountToSwapTokenA,
      _nextSwapInformation.ratePerUnitAToB,
      _nextSwapInformation.swapsToPerform[0].swapToPerform
    );
    _registerSwap(
      _swapInterval,
      address(tokenB),
      _nextSwapInformation.amountToSwapTokenB,
      _nextSwapInformation.ratePerUnitBToA,
      _nextSwapInformation.swapsToPerform[0].swapToPerform
    );
    performedSwaps[_swapInterval] = _nextSwapInformation.swapsToPerform[0].swapToPerform;
    lastSwapPerformed[_swapInterval] = _getTimestamp();
    require(
      _amountToBorrowTokenA <= _nextSwapInformation.availableToBorrowTokenA &&
        _amountToBorrowTokenB <= _nextSwapInformation.availableToBorrowTokenB,
      'DCAPair: insufficient liquidity'
    );

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
    require(_balanceTokenA >= _amountToHaveTokenA && _balanceTokenB >= _amountToHaveTokenB, 'DCAPair: liquidity not returned');

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
