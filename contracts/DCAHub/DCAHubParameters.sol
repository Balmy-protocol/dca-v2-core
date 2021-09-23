// SPDX-License-Identifier: BUSL-1.1
pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
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

  error InvalidInterval();
  error InvalidMask();

  // Internal constants
  uint24 public constant FEE_PRECISION = 10000;
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
  mapping(address => mapping(address => bytes1)) internal _activeSwapIntervals; // token A => token B => active swap intervals

  mapping(address => uint256) public platformBalance; // token => balance
  mapping(address => uint256) internal _balances; // token => balance
  mapping(uint32 => uint8) private _intervalIndex;

  function isSwapIntervalActive(
    address _tokenA,
    address _tokenB,
    uint32 _activeSwapInterval
  ) external view returns (bool _isIntervalActive) {
    bytes1 _activeIntervals = _tokenA < _tokenB ? _activeSwapIntervals[_tokenA][_tokenB] : _activeSwapIntervals[_tokenB][_tokenA];
    _isIntervalActive = _activeIntervals & intervalToMask(_activeSwapInterval) != 0;
  }

  function _getFeeFromAmount(uint32 _feeAmount, uint256 _amount) internal pure returns (uint256) {
    return (_amount * _feeAmount) / FEE_PRECISION / 100;
  }

  function _applyFeeToAmount(uint32 _feeAmount, uint256 _amount) internal pure returns (uint256) {
    // TODO: These 2 are the same, but one might lose precision. Re-check in the futute
    // return (_amount * (FEE_PRECISION * 100 - _feeAmount)) / (FEE_PRECISION * 100;
    return (_amount * (FEE_PRECISION - _feeAmount / 100)) / FEE_PRECISION;
  }

  function intervalToMask(uint32 _swapInterval) public pure returns (bytes1) {
    if (_swapInterval == 5 minutes) return 0x01;
    if (_swapInterval == 15 minutes) return 0x02;
    if (_swapInterval == 30 minutes) return 0x04;
    if (_swapInterval == 1 hours) return 0x08;
    if (_swapInterval == 12 hours) return 0x10;
    if (_swapInterval == 1 days) return 0x20;
    if (_swapInterval == 1 weeks) return 0x40;
    if (_swapInterval == 30 days) return 0x80;
    revert InvalidInterval();
  }

  function maskToInterval(bytes1 _mask) public pure returns (uint32) {
    if (_mask == 0x01) return 5 minutes;
    if (_mask == 0x02) return 15 minutes;
    if (_mask == 0x04) return 30 minutes;
    if (_mask == 0x08) return 1 hours;
    if (_mask == 0x10) return 12 hours;
    if (_mask == 0x20) return 1 days;
    if (_mask == 0x40) return 1 weeks;
    if (_mask == 0x80) return 30 days;
    revert InvalidMask();
  }
}
