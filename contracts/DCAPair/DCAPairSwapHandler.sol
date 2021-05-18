// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;
pragma abicoder v2;

import 'hardhat/console.sol';

import '../interfaces/ISlidingOracle.sol';
import '../interfaces/IDCAPairSwapCallee.sol';
import './DCAPairParameters.sol';

interface IDCAPairSwapHandler {
  struct NextSwapInformation {
    uint256 swapToPerform;
    uint256 amountToSwapTokenA;
    uint256 amountToSwapTokenB;
    uint256 ratePerUnitBToA;
    uint256 ratePerUnitAToB;
    uint256 tokenAFee;
    uint256 tokenBFee;
    uint256 amountToBeProvidedBySwapper;
    uint256 amountToRewardSwapperWith;
    IERC20Detailed tokenToBeProvidedBySwapper;
    IERC20Detailed tokenToRewardSwapperWith;
  }

  event OracleSet(ISlidingOracle _oracle);

  event SwapIntervalSet(uint256 _swapInterval);

  event Swapped(NextSwapInformation _nextSwapInformation);

  function swapInterval() external returns (uint256);

  function lastSwapPerformed() external returns (uint256);

  function swapAmountAccumulator(address) external returns (uint256);

  function oracle() external returns (ISlidingOracle);

  function setOracle(ISlidingOracle _oracle) external;

  function setSwapInterval(uint256 _swapInterval) external;

  function getNextSwapInfo() external view returns (NextSwapInformation memory _nextSwapInformation);

  function swap() external;

  function swap(address _to, bytes calldata _data) external;
}

abstract contract DCAPairSwapHandler is DCAPairParameters, IDCAPairSwapHandler {
  using SafeERC20 for IERC20Detailed;

  uint256 internal constant _MINIMUM_SWAP_INTERVAL = 1 minutes;

  mapping(address => uint256) public override swapAmountAccumulator;
  uint256 public override swapInterval;
  uint256 public override lastSwapPerformed;
  ISlidingOracle public override oracle;

  constructor(ISlidingOracle _oracle, uint256 _swapInterval) {
    _setOracle(_oracle);
    _setSwapInterval(_swapInterval);
  }

  function _setOracle(ISlidingOracle _oracle) internal {
    require(address(_oracle) != address(0), 'DCAPair: zero address');
    oracle = _oracle;
    emit OracleSet(_oracle);
  }

  function _setSwapInterval(uint256 _swapInterval) internal {
    require(_swapInterval >= _MINIMUM_SWAP_INTERVAL, 'DCAPair: interval too short');
    swapInterval = _swapInterval;
    emit SwapIntervalSet(_swapInterval);
  }

  function _addNewRatePerUnit(
    address _address,
    uint256 _performedSwap,
    uint256 _ratePerUnit
  ) internal {
    uint256 _previousSwap = _performedSwap - 1;
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
    uint256 _swapToRegister
  ) internal {
    swapAmountAccumulator[_token] = _internalAmountUsedToSwap;
    _addNewRatePerUnit(_token, _swapToRegister, _ratePerUnit);
    delete swapAmountDelta[_token][_swapToRegister];
  }

  function _getAmountToSwap(address _address, uint256 _swapToPerform) internal view returns (uint256 _swapAmountAccumulator) {
    unchecked {_swapAmountAccumulator = swapAmountAccumulator[_address] + uint256(swapAmountDelta[_address][_swapToPerform]);}
  }

  function _convertTo(
    uint256 _fromTokenMagnitude,
    uint256 _amountFrom,
    uint256 _rateFromTo
  ) internal pure returns (uint256 _amountTo) {
    _amountTo = (_amountFrom * _rateFromTo) / _fromTokenMagnitude;
  }

  function _calculateNecessary(
    uint256 _fromTokenMagnitude,
    uint256 _amountTo,
    uint256 _rateFromTo
  ) internal pure returns (uint256 _amountFrom) {
    _amountFrom = (_amountTo * _fromTokenMagnitude) / _rateFromTo;
  }

  function getNextSwapInfo() public view override returns (NextSwapInformation memory _nextSwapInformation) {
    _nextSwapInformation.swapToPerform = performedSwaps + 1;
    _nextSwapInformation.amountToSwapTokenA = _getAmountToSwap(address(tokenA), _nextSwapInformation.swapToPerform);
    _nextSwapInformation.tokenAFee = _getFeeFromAmount(_nextSwapInformation.amountToSwapTokenA);
    _nextSwapInformation.amountToSwapTokenB = _getAmountToSwap(address(tokenB), _nextSwapInformation.swapToPerform);
    _nextSwapInformation.tokenBFee = _getFeeFromAmount(_nextSwapInformation.amountToSwapTokenB);
    // TODO: Instead of using current, it should use quote to get a moving average and not current?
    _nextSwapInformation.ratePerUnitBToA = oracle.current(address(tokenB), _magnitudeB, address(tokenA));
    _nextSwapInformation.ratePerUnitAToB = _calculateNecessary(_magnitudeB, _magnitudeA, _nextSwapInformation.ratePerUnitBToA);

    uint256 _amountOfTokenAIfTokenBSwapped =
      _convertTo(_magnitudeB, _nextSwapInformation.amountToSwapTokenB, _nextSwapInformation.ratePerUnitBToA);

    if (_amountOfTokenAIfTokenBSwapped < _nextSwapInformation.amountToSwapTokenA) {
      _nextSwapInformation.tokenToBeProvidedBySwapper = tokenB;
      _nextSwapInformation.tokenToRewardSwapperWith = tokenA;
      uint256 _tokenASurplus = _nextSwapInformation.amountToSwapTokenA - _amountOfTokenAIfTokenBSwapped;
      _nextSwapInformation.amountToBeProvidedBySwapper = _convertTo(_magnitudeA, _tokenASurplus, _nextSwapInformation.ratePerUnitAToB);
      _nextSwapInformation.amountToRewardSwapperWith = _tokenASurplus + _getFeeFromAmount(_tokenASurplus);
    } else if (_amountOfTokenAIfTokenBSwapped > _nextSwapInformation.amountToSwapTokenA) {
      _nextSwapInformation.tokenToBeProvidedBySwapper = tokenA;
      _nextSwapInformation.tokenToRewardSwapperWith = tokenB;
      _nextSwapInformation.amountToBeProvidedBySwapper = _amountOfTokenAIfTokenBSwapped - _nextSwapInformation.amountToSwapTokenA;
      _nextSwapInformation.amountToRewardSwapperWith = _convertTo(
        _magnitudeA,
        _nextSwapInformation.amountToBeProvidedBySwapper + _getFeeFromAmount(_nextSwapInformation.amountToBeProvidedBySwapper),
        _nextSwapInformation.ratePerUnitAToB
      );
    }
  }

  function _swap(address _to, bytes memory _data) internal {
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
      require(
        _balanceAfter >= _balanceBefore + _nextSwapInformation.amountToBeProvidedBySwapper,
        'DCAPair: callee did not provide the expected liquidity'
      );
    } else if (_nextSwapInformation.amountToBeProvidedBySwapper > 0) {
      _nextSwapInformation.tokenToBeProvidedBySwapper.safeTransferFrom(
        msg.sender,
        address(this),
        _nextSwapInformation.amountToBeProvidedBySwapper
      );
      _nextSwapInformation.tokenToRewardSwapperWith.safeTransfer(msg.sender, _nextSwapInformation.amountToRewardSwapperWith);
    }

    // Send fees
    tokenA.safeTransfer(factory.feeRecipient(), _nextSwapInformation.tokenAFee);
    tokenB.safeTransfer(factory.feeRecipient(), _nextSwapInformation.tokenBFee);
    emit Swapped(_nextSwapInformation);
  }
}
