// SPDX-License-Identifier: BUSL-1.1
pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/access/AccessControl.sol';
import '@openzeppelin/contracts/security/Pausable.sol';

import './DCAHubParameters.sol';
import '../interfaces/ITimeWeightedOracle.sol';
import '../libraries/CommonErrors.sol';

abstract contract DCAHubConfigHandler is DCAHubParameters, AccessControl, Pausable {
  using EnumerableSet for EnumerableSet.UintSet;

  event OracleSet(ITimeWeightedOracle oracle);
  event SwapFeeSet(uint32 feeSet);
  event LoanFeeSet(uint32 feeSet);
  event SwapIntervalsAllowed(uint32[] swapIntervals);
  event SwapIntervalsForbidden(uint32[] swapIntervals);
  error HighFee();
  error InvalidInterval2(); // TODO: update when we make the interface correctly

  bytes32 public constant IMMEDIATE_ROLE = keccak256('IMMEDIATE_ROLE');
  bytes32 public constant TIME_LOCKED_ROLE = keccak256('TIME_LOCKED_ROLE');
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
  ITimeWeightedOracle public oracle;
  uint32 public swapFee = 6000; // 0.6%
  uint32 public loanFee = 1000; // 0.1%
  uint32 public constant MAX_FEE = 10 * FEE_PRECISION; // 10%
  bytes1 internal _allowedSwapIntervals;
  mapping(uint32 => uint8) private _intervalIndex;

  constructor(
    address _immediateGovernor,
    address _timeLockedGovernor,
    ITimeWeightedOracle _oracle
  ) {
    if (_immediateGovernor == address(0) || _timeLockedGovernor == address(0) || address(_oracle) == address(0))
      revert CommonErrors.ZeroAddress();
    _setupRole(IMMEDIATE_ROLE, _immediateGovernor);
    _setupRole(TIME_LOCKED_ROLE, _timeLockedGovernor);
    // We set each role as its own admin, so they can assign new addresses with the same role
    _setRoleAdmin(IMMEDIATE_ROLE, IMMEDIATE_ROLE);
    _setRoleAdmin(TIME_LOCKED_ROLE, TIME_LOCKED_ROLE);
    oracle = _oracle;

    for (uint8 i; i < SUPPORTED_SWAP_INTERVALS.length; i++) {
      // Note: we add one to the index to that we can differentiate intervals that were not set
      _intervalIndex[SUPPORTED_SWAP_INTERVALS[i]] = i + 1;
    }
  }

  function setOracle(ITimeWeightedOracle _oracle) external onlyRole(TIME_LOCKED_ROLE) {
    if (address(_oracle) == address(0)) revert CommonErrors.ZeroAddress();
    oracle = _oracle;
    emit OracleSet(_oracle);
  }

  function setSwapFee(uint32 _swapFee) external onlyRole(TIME_LOCKED_ROLE) {
    if (_swapFee > MAX_FEE) revert HighFee();
    swapFee = _swapFee;
    emit SwapFeeSet(_swapFee);
  }

  function setLoanFee(uint32 _loanFee) external onlyRole(TIME_LOCKED_ROLE) {
    if (_loanFee > MAX_FEE) revert HighFee();
    loanFee = _loanFee;
    emit LoanFeeSet(_loanFee);
  }

  function addSwapIntervalsToAllowedList(uint32[] calldata _swapIntervals) external onlyRole(IMMEDIATE_ROLE) {
    for (uint256 i; i < _swapIntervals.length; i++) {
      _allowedSwapIntervals |= _getByteForSwapInterval(_swapIntervals[i]);
    }
    emit SwapIntervalsAllowed(_swapIntervals);
  }

  function removeSwapIntervalsFromAllowedList(uint32[] calldata _swapIntervals) external onlyRole(IMMEDIATE_ROLE) {
    bytes1 _allOnes = 0xFF;
    for (uint256 i; i < _swapIntervals.length; i++) {
      bytes1 _mask = _getByteForSwapInterval(_swapIntervals[i]) ^ _allOnes;
      _allowedSwapIntervals &= _mask;
    }
    emit SwapIntervalsForbidden(_swapIntervals);
  }

  function isSwapIntervalAllowed(uint32 _swapInterval) external view returns (bool) {
    bytes1 _mask = _getByteForSwapInterval(_swapInterval);
    return _allowedSwapIntervals & _mask != 0;
  }

  function pause() external onlyRole(IMMEDIATE_ROLE) {
    _pause();
  }

  function unpause() external onlyRole(IMMEDIATE_ROLE) {
    _unpause();
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
