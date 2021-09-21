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
  event SwapIntervalsAllowed(uint32[] swapIntervals, string[] descriptions);
  event SwapIntervalsForbidden(uint32[] swapIntervals);
  error HighFee();
  error InvalidParams();
  error ZeroInterval();
  error EmptyDescription();

  bytes32 public constant IMMEDIATE_ROLE = keccak256('IMMEDIATE_ROLE');
  bytes32 public constant TIME_LOCKED_ROLE = keccak256('TIME_LOCKED_ROLE');

  ITimeWeightedOracle public oracle;
  uint32 public swapFee = 6000; // 0.6%
  uint32 public loanFee = 1000; // 0.1%
  uint32 public constant MAX_FEE = 10 * FEE_PRECISION; // 10%
  mapping(uint32 => string) public intervalDescription;
  uint32[] internal _allowedSwapIntervals; // TODO: Explore possibility of avoid array

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

  function addSwapIntervalsToAllowedList(uint32[] calldata _swapIntervals, string[] calldata _descriptions) external onlyRole(IMMEDIATE_ROLE) {
    if (_swapIntervals.length != _descriptions.length) revert InvalidParams();
    for (uint256 i; i < _swapIntervals.length; i++) {
      if (_swapIntervals[i] == 0) revert ZeroInterval();
      if (bytes(_descriptions[i]).length == 0) revert EmptyDescription();
      if (this.isSwapIntervalAllowed(_swapIntervals[i])) continue;
      intervalDescription[_swapIntervals[i]] = _descriptions[i];
      _addSorted(_swapIntervals[i]);
    }
    emit SwapIntervalsAllowed(_swapIntervals, _descriptions);
  }

  function removeSwapIntervalsFromAllowedList(uint32[] calldata _swapIntervals) external onlyRole(IMMEDIATE_ROLE) {
    for (uint256 i; i < _swapIntervals.length; i++) {
      uint8 _index = _find(_swapIntervals[i]);
      if (_index == _swapIntervals.length) continue;
      delete _allowedSwapIntervals[_index];
      delete intervalDescription[_swapIntervals[i]];
    }
    emit SwapIntervalsForbidden(_swapIntervals);
  }

  function allowedSwapIntervals() external view returns (uint32[] memory) {
    return _allowedSwapIntervals;
  }

  function isSwapIntervalAllowed(uint32 _swapInterval) external view returns (bool) {
    return bytes(intervalDescription[_swapInterval]).length > 0;
  }

  function pause() external onlyRole(IMMEDIATE_ROLE) {
    _pause();
  }

  function unpause() external onlyRole(IMMEDIATE_ROLE) {
    _unpause();
  }

  function _find(uint32 _swapInterval) internal view returns (uint8 _index) {
    while (_index < _allowedSwapIntervals.length && _allowedSwapIntervals[_index] != _swapInterval) {
      _index++;
    }
  }

  function _addSorted(uint32 _swapInterval) internal {
    _allowedSwapIntervals.push(_swapInterval);
    uint256 i = _allowedSwapIntervals.length - 1;
    while (i > 0 && _allowedSwapIntervals[i - 1] >= _swapInterval) {
      _allowedSwapIntervals[i] = _allowedSwapIntervals[i - 1];
      i--;
    }
    if (i < _allowedSwapIntervals.length - 1) {
      _allowedSwapIntervals[i] = _swapInterval;
    }
  }
}
