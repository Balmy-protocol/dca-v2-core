// SPDX-License-Identifier: BUSL-1.1
pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/utils/structs/EnumerableSet.sol';
import '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';

import '../interfaces/IDCAHub.sol';
import '../libraries/CommonErrors.sol';

import './utils/Math.sol';

abstract contract DCAHubParameters is IDCAHubParameters {
  struct SwapData {
    uint32 performedSwaps;
    uint32 nextSwapAvailable;
    uint256 nextAmountToSwapAToB;
    uint256 nextAmountToSwapBToA;
  }

  struct SwapDelta {
    int256 swapDeltaAToB;
    int256 swapDeltaBToA;
  }

  struct AccumRatio {
    uint256 accumRatioAToB;
    uint256 accumRatioBToA;
  }

  struct PairInfo {
    SwapData swapData;
    mapping(uint32 => SwapDelta) swapAmountDelta;
    mapping(uint32 => AccumRatio) accumRatio;
  }

  using EnumerableSet for EnumerableSet.UintSet;

  // Internal constants
  uint24 public constant FEE_PRECISION = 10000;

  // Tracking
  mapping(address => mapping(address => mapping(uint32 => PairInfo))) public pairInfo; // tokenA => token B => swap interval => pair data
  mapping(address => mapping(address => EnumerableSet.UintSet)) internal _activeSwapIntervals; // token A => token B => active swap intervals

  mapping(address => uint256) public platformBalance; // token => balance
  mapping(address => uint256) internal _balances; // token => balance

  function isSwapIntervalActive(
    address _tokenA,
    address _tokenB,
    uint32 _activeSwapInterval
  ) external view returns (bool _isIntervalActive) {
    _isIntervalActive = _tokenA < _tokenB
      ? _activeSwapIntervals[_tokenA][_tokenB].contains(_activeSwapInterval)
      : _activeSwapIntervals[_tokenB][_tokenA].contains(_activeSwapInterval);
  }

  function _getFeeFromAmount(uint32 _feeAmount, uint256 _amount) internal pure returns (uint256) {
    return (_amount * _feeAmount) / FEE_PRECISION / 100;
  }

  function _applyFeeToAmount(uint32 _feeAmount, uint256 _amount) internal pure returns (uint256) {
    // TODO: These 2 are the same, but one might lose precision. Re-check in the futute
    // return (_amount * (FEE_PRECISION * 100 - _feeAmount)) / (FEE_PRECISION * 100;
    return (_amount * (FEE_PRECISION - _feeAmount / 100)) / FEE_PRECISION;
  }
}
