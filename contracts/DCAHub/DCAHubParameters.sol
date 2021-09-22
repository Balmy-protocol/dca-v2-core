// SPDX-License-Identifier: BUSL-1.1
pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';

import '../interfaces/IDCAHub.sol';
import '../libraries/CommonErrors.sol';
import '../libraries/IntervalsSet.sol';

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

  error InvalidInterval2(); // TODO: update when we make the interface correctly

  using IntervalsSet for IntervalsSet.Set;

  // Internal constants
  uint24 public constant FEE_PRECISION = 10000;
  // solhint-disable-next-line var-name-mixedcase
  uint32[8] public SUPPORTED_SWAP_INTERVALS = [5 minutes, 15 minutes, 30 minutes, 1 hours, 12 hours, 1 days, 1 weeks, 30 days];
  // TODO: If they are going to be hard-coded, maybe we want to move them to the descriptor directly?
  // solhint-disable-next-line var-name-mixedcase
  string[8] public SWAP_INTERVALS_DESCRIPTIONS = [
    'Every 5 minutes',
    'Every 15 minutes',
    'Evert 30 minutes',
    'Hourly',
    'Every 12 hours',
    'Daily',
    'Weekly',
    'Monthy'
  ];

  // Tracking
  mapping(address => mapping(address => mapping(uint32 => mapping(uint32 => SwapDelta)))) public swapAmountDelta; // token A => token B => swap interval => swap number => delta
  mapping(address => mapping(address => mapping(uint32 => mapping(uint32 => AccumRatio)))) public accumRatio; // token A => token B => swap interval => swap number => accum
  mapping(address => mapping(address => mapping(uint32 => SwapData))) public swapData; // token A => token B => swap interval => swap data
  mapping(address => mapping(address => IntervalsSet.Set)) internal _activeSwapIntervals; // token A => token B => active swap intervals

  mapping(address => uint256) public platformBalance; // token => balance
  mapping(address => uint256) internal _balances; // token => balance
  mapping(uint32 => uint8) private _intervalIndex;

  constructor() {
    for (uint8 i; i < SUPPORTED_SWAP_INTERVALS.length; i++) {
      // Note: we add one to the index so that we can differentiate intervals that were not set
      _intervalIndex[SUPPORTED_SWAP_INTERVALS[i]] = i + 1;
    }
  }

  function isSwapIntervalActive(
    address _tokenA,
    address _tokenB,
    uint8 _activeSwapInterval
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

  /** Returns a byte where the only activated bit is in the same position as the swap interval's index */
  function _getByteForSwapInterval(uint32 _swapInterval) internal view returns (bytes1 _mask) {
    uint8 _index = _getIndex(_swapInterval);
    _mask = (bytes1(uint8(1) << _index));
  }

  function _getIndex(uint32 _swapInterval) internal view returns (uint8 _index) {
    _index = _intervalIndex[_swapInterval];
    if (_index == 0) revert InvalidInterval2();
    _index--;
  }
}
