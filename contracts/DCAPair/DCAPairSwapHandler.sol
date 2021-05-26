// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;
pragma abicoder v2;

import 'hardhat/console.sol';

import '../interfaces/ISlidingOracle.sol';
import '../interfaces/IDCAPairSwapCallee.sol';
import './DCAPairParameters.sol';

abstract contract DCAPairSwapHandler is DCAPairParameters, IDCAPairSwapHandler {
  using SafeERC20 for IERC20Detailed;

  uint32 internal constant _MINIMUM_SWAP_INTERVAL = 1 minutes;

  mapping(address => uint256) public override swapAmountAccumulator;
  uint32 public override swapInterval;
  uint256 public override lastSwapPerformed;
  ISlidingOracle public override oracle;

  constructor(ISlidingOracle _oracle, uint32 _swapInterval) {
    require(address(_oracle) != address(0), 'DCAPair: zero address');
    require(_swapInterval >= _MINIMUM_SWAP_INTERVAL, 'DCAPair: interval too short');
    oracle = _oracle;
    swapInterval = _swapInterval;
  }

  function _addNewRatePerUnit(
    address _address,
    uint32 _performedSwap,
    uint256 _ratePerUnit
  ) internal {
    uint32 _previousSwap = _performedSwap - 1;
    uint256[2] memory _accumRatesPerUnitPreviousSwap = _accumRatesPerUnit[_address][_previousSwap];
    (bool _ok, uint256 _result) = Math.tryAdd(_accumRatesPerUnitPreviousSwap[0], _ratePerUnit);
    if (_ok) {
      _accumRatesPerUnit[_address][_performedSwap] = [_result, _accumRatesPerUnitPreviousSwap[1]];
    } else {
      uint256 _missingUntilOverflow = type(uint256).max - _accumRatesPerUnitPreviousSwap[0];
      _accumRatesPerUnit[_address][_performedSwap] = [_ratePerUnit - _missingUntilOverflow, _accumRatesPerUnitPreviousSwap[1] + 1];
    }
  }

  function _registerSwap(
    address _token,
    uint256 _internalAmountUsedToSwap,
    uint256 _ratePerUnit,
    uint32 _swapToRegister
  ) internal {
    swapAmountAccumulator[_token] = _internalAmountUsedToSwap;
    _addNewRatePerUnit(_token, _swapToRegister, _ratePerUnit);
    delete swapAmountDelta[_token][_swapToRegister];
  }

  function _getAmountToSwap(address _address, uint32 _swapToPerform) internal view returns (uint256 _swapAmountAccumulator) {
    unchecked {_swapAmountAccumulator = swapAmountAccumulator[_address] + uint256(swapAmountDelta[_address][_swapToPerform]);}
  }

  function _convertTo(
    uint256 _fromTokenMagnitude,
    uint256 _amountFrom,
    uint256 _rateFromTo
  ) internal pure returns (uint256 _amountTo) {
    _amountTo = (_amountFrom * _rateFromTo) / _fromTokenMagnitude;
  }

  function getNextSwapInfo() public view override returns (NextSwapInformation memory _nextSwapInformation) {
    _nextSwapInformation.swapToPerform = performedSwaps + 1;
    _nextSwapInformation.amountToSwapTokenA = _getAmountToSwap(address(tokenA), _nextSwapInformation.swapToPerform);
    _nextSwapInformation.amountToSwapTokenB = _getAmountToSwap(address(tokenB), _nextSwapInformation.swapToPerform);
    // TODO: Instead of using current, it should use quote to get a moving average and not current?
    _nextSwapInformation.ratePerUnitBToA = oracle.current(address(tokenB), _magnitudeB, address(tokenA));
    _nextSwapInformation.ratePerUnitAToB = (_magnitudeB * _magnitudeA) / _nextSwapInformation.ratePerUnitBToA;

    uint256 _amountOfTokenAIfTokenBSwapped =
      _convertTo(_magnitudeB, _nextSwapInformation.amountToSwapTokenB, _nextSwapInformation.ratePerUnitBToA);

    // TODO: We are calling _getFeeFromAmount (which makes a call to the factory) a lot. See if we can call the factory only once
    if (_amountOfTokenAIfTokenBSwapped < _nextSwapInformation.amountToSwapTokenA) {
      _nextSwapInformation.tokenToBeProvidedBySwapper = tokenB;
      _nextSwapInformation.tokenToRewardSwapperWith = tokenA;
      uint256 _tokenASurplus = _nextSwapInformation.amountToSwapTokenA - _amountOfTokenAIfTokenBSwapped;
      _nextSwapInformation.amountToBeProvidedBySwapper = _convertTo(_magnitudeA, _tokenASurplus, _nextSwapInformation.ratePerUnitAToB);
      _nextSwapInformation.amountToRewardSwapperWith = _tokenASurplus + _getFeeFromAmount(_tokenASurplus);
      _nextSwapInformation.platformFeeTokenA = _getFeeFromAmount(_amountOfTokenAIfTokenBSwapped);
      _nextSwapInformation.platformFeeTokenB = _getFeeFromAmount(_nextSwapInformation.amountToSwapTokenB);
    } else if (_amountOfTokenAIfTokenBSwapped > _nextSwapInformation.amountToSwapTokenA) {
      _nextSwapInformation.tokenToBeProvidedBySwapper = tokenA;
      _nextSwapInformation.tokenToRewardSwapperWith = tokenB;
      _nextSwapInformation.amountToBeProvidedBySwapper = _amountOfTokenAIfTokenBSwapped - _nextSwapInformation.amountToSwapTokenA;
      uint256 _amountToBeProvidedConvertedToB =
        _convertTo(_magnitudeA, _nextSwapInformation.amountToBeProvidedBySwapper, _nextSwapInformation.ratePerUnitAToB);
      _nextSwapInformation.amountToRewardSwapperWith = _amountToBeProvidedConvertedToB + _getFeeFromAmount(_amountToBeProvidedConvertedToB);
      _nextSwapInformation.platformFeeTokenA = _getFeeFromAmount(_nextSwapInformation.amountToSwapTokenA);
      _nextSwapInformation.platformFeeTokenB = _getFeeFromAmount(_nextSwapInformation.amountToSwapTokenB - _amountToBeProvidedConvertedToB);
    } else {
      _nextSwapInformation.platformFeeTokenA = _getFeeFromAmount(_nextSwapInformation.amountToSwapTokenA);
      _nextSwapInformation.platformFeeTokenB = _getFeeFromAmount(_nextSwapInformation.amountToSwapTokenB);
    }
  }

  function swap() public override {
    swap(address(0), '');
  }

  function swap(address _to, bytes memory _data) public override {
    require(lastSwapPerformed <= block.timestamp - swapInterval, 'DCAPair: within swap interval');
    NextSwapInformation memory _nextSwapInformation = getNextSwapInfo();

    _registerSwap(
      address(tokenA),
      _nextSwapInformation.amountToSwapTokenA,
      _nextSwapInformation.ratePerUnitAToB,
      _nextSwapInformation.swapToPerform
    );
    _registerSwap(
      address(tokenB),
      _nextSwapInformation.amountToSwapTokenB,
      _nextSwapInformation.ratePerUnitBToA,
      _nextSwapInformation.swapToPerform
    );
    performedSwaps = _nextSwapInformation.swapToPerform;
    lastSwapPerformed = block.timestamp;

    if (_to != address(0)) {
      uint256 _balanceBefore = _nextSwapInformation.tokenToBeProvidedBySwapper.balanceOf(address(this));

      // Optimistically transfer tokens
      if (_nextSwapInformation.amountToRewardSwapperWith > 0) {
        _nextSwapInformation.tokenToRewardSwapperWith.safeTransfer(_to, _nextSwapInformation.amountToRewardSwapperWith);
      }

      // Make call
      IDCAPairSwapCallee(_to).DCAPairSwapCall(
        msg.sender,
        _nextSwapInformation.tokenToRewardSwapperWith,
        _nextSwapInformation.amountToRewardSwapperWith,
        _nextSwapInformation.tokenToBeProvidedBySwapper,
        _nextSwapInformation.amountToBeProvidedBySwapper,
        _data
      );

      uint256 _balanceAfter = _nextSwapInformation.tokenToBeProvidedBySwapper.balanceOf(address(this));

      // Make sure that they sent the tokens back
      require(_balanceAfter >= _balanceBefore + _nextSwapInformation.amountToBeProvidedBySwapper, 'DCAPair: not enough liquidity');
    } else if (_nextSwapInformation.amountToBeProvidedBySwapper > 0) {
      _nextSwapInformation.tokenToBeProvidedBySwapper.safeTransferFrom(
        msg.sender,
        address(this),
        _nextSwapInformation.amountToBeProvidedBySwapper
      );
      _nextSwapInformation.tokenToRewardSwapperWith.safeTransfer(msg.sender, _nextSwapInformation.amountToRewardSwapperWith);
    }

    // Send fees
    tokenA.safeTransfer(factory.feeRecipient(), _nextSwapInformation.platformFeeTokenA);
    tokenB.safeTransfer(factory.feeRecipient(), _nextSwapInformation.platformFeeTokenB);
    emit Swapped(_nextSwapInformation);
  }
}
