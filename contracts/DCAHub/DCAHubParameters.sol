// SPDX-License-Identifier: BUSL-1.1
pragma solidity >=0.8.7 <0.9.0;

import '../interfaces/IDCAHub.sol';
import './utils/Math.sol';

abstract contract DCAHubParameters is IDCAHubParameters {
  struct SwapData {
    uint32 performedSwaps;
    uint224 nextAmountToSwapAToB;
    uint32 lastSwappedAt;
    uint224 nextAmountToSwapBToA;
  }

  struct SwapDelta {
    int128 swapDeltaAToB;
    int128 swapDeltaBToA;
  }

  struct AccumRatio {
    uint256 accumRatioAToB;
    uint256 accumRatioBToA;
  }

  error InvalidInterval();
  error InvalidMask();

  // Internal constants
  uint24 public constant FEE_PRECISION = 10000;

  // Tracking
  mapping(address => mapping(address => mapping(bytes1 => mapping(uint32 => SwapDelta)))) public swapAmountDelta; // token A => token B => swap interval => swap number => delta
  mapping(address => mapping(address => mapping(bytes1 => mapping(uint32 => AccumRatio)))) public accumRatio; // token A => token B => swap interval => swap number => accum
  mapping(address => mapping(address => mapping(bytes1 => SwapData))) public swapData; // token A => token B => swap interval => swap data
  mapping(address => mapping(address => bytes1)) public activeSwapIntervals; // token A => token B => active swap intervals
  mapping(address => uint256) public platformBalance; // token => balance

  function _calculateMagnitude(address _token) internal view returns (uint120) {
    return uint120(10**IERC20Metadata(_token).decimals());
  }

  function _getFeeFromAmount(uint32 _feeAmount, uint256 _amount) internal pure returns (uint256) {
    return (_amount * _feeAmount) / FEE_PRECISION / 100;
  }

  function _applyFeeToAmount(uint32 _feeAmount, uint256 _amount) internal pure returns (uint256) {
    return (_amount * (FEE_PRECISION - _feeAmount / 100)) / FEE_PRECISION;
  }

  function intervalToMask(uint32 _swapInterval) public pure returns (bytes1) {
    if (_swapInterval == 1 minutes) return 0x01;
    if (_swapInterval == 5 minutes) return 0x02;
    if (_swapInterval == 15 minutes) return 0x04;
    if (_swapInterval == 30 minutes) return 0x08;
    if (_swapInterval == 1 hours) return 0x10;
    if (_swapInterval == 4 hours) return 0x20;
    if (_swapInterval == 1 days) return 0x40;
    if (_swapInterval == 1 weeks) return 0x80;
    revert InvalidInterval();
  }

  function maskToInterval(bytes1 _mask) public pure returns (uint32) {
    if (_mask == 0x01) return 1 minutes;
    if (_mask == 0x02) return 5 minutes;
    if (_mask == 0x04) return 15 minutes;
    if (_mask == 0x08) return 30 minutes;
    if (_mask == 0x10) return 1 hours;
    if (_mask == 0x20) return 4 hours;
    if (_mask == 0x40) return 1 days;
    if (_mask == 0x80) return 1 weeks;
    revert InvalidMask();
  }
}
