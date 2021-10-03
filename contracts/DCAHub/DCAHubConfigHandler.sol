// SPDX-License-Identifier: BUSL-1.1
pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/access/AccessControl.sol';
import '@openzeppelin/contracts/security/Pausable.sol';
import '../interfaces/ITimeWeightedOracle.sol';
import '../libraries/Intervals.sol';
import '../libraries/FeeMath.sol';
import './DCAHubParameters.sol';

abstract contract DCAHubConfigHandler is DCAHubParameters, AccessControl, Pausable, IDCAHubConfigHandler {
  // Internal constants (should be constants, but apparently the byte code size increases when they are)
  // solhint-disable var-name-mixedcase
  bytes32 public IMMEDIATE_ROLE = keccak256('IMMEDIATE_ROLE');
  bytes32 public TIME_LOCKED_ROLE = keccak256('TIME_LOCKED_ROLE');
  bytes32 public PLATFORM_WITHDRAW_ROLE = keccak256('PLATFORM_WITHDRAW_ROLE');
  uint32 public MAX_FEE = 10 * FeeMath.FEE_PRECISION; // 10%
  // solhint-enable var-name-mixedcase

  ITimeWeightedOracle public oracle;
  uint32 public swapFee = 6000; // 0.6%
  uint32 public loanFee = 1000; // 0.1%
  bytes1 public allowedSwapIntervals = 0xF0; // Start allowing weekly, daily, every 4 hours, hourly

  constructor(
    address _immediateGovernor,
    address _timeLockedGovernor,
    ITimeWeightedOracle _oracle
  ) {
    if (_immediateGovernor == address(0) || _timeLockedGovernor == address(0) || address(_oracle) == address(0)) revert IDCAHub.ZeroAddress();
    _setupRole(IMMEDIATE_ROLE, _immediateGovernor);
    _setupRole(TIME_LOCKED_ROLE, _timeLockedGovernor);
    _setRoleAdmin(PLATFORM_WITHDRAW_ROLE, TIME_LOCKED_ROLE);
    // We set each role as its own admin, so they can assign new addresses with the same role
    _setRoleAdmin(IMMEDIATE_ROLE, IMMEDIATE_ROLE);
    _setRoleAdmin(TIME_LOCKED_ROLE, TIME_LOCKED_ROLE);
    oracle = _oracle;
  }

  function setOracle(ITimeWeightedOracle _oracle) external onlyRole(TIME_LOCKED_ROLE) {
    _assertNonZeroAddress(address(_oracle));
    oracle = _oracle;
    emit OracleSet(_oracle);
  }

  function setSwapFee(uint32 _swapFee) external onlyRole(TIME_LOCKED_ROLE) {
    _validateFee(_swapFee);
    swapFee = _swapFee;
    emit SwapFeeSet(_swapFee);
  }

  function setLoanFee(uint32 _loanFee) external onlyRole(TIME_LOCKED_ROLE) {
    _validateFee(_loanFee);
    loanFee = _loanFee;
    emit LoanFeeSet(_loanFee);
  }

  function addSwapIntervalsToAllowedList(uint32[] calldata _swapIntervals) external onlyRole(IMMEDIATE_ROLE) {
    for (uint256 i; i < _swapIntervals.length; i++) {
      allowedSwapIntervals |= Intervals.intervalToMask(_swapIntervals[i]);
    }
    emit SwapIntervalsAllowed(_swapIntervals);
  }

  function removeSwapIntervalsFromAllowedList(uint32[] calldata _swapIntervals) external onlyRole(IMMEDIATE_ROLE) {
    for (uint256 i; i < _swapIntervals.length; i++) {
      allowedSwapIntervals &= ~Intervals.intervalToMask(_swapIntervals[i]);
    }
    emit SwapIntervalsForbidden(_swapIntervals);
  }

  function pause() external onlyRole(IMMEDIATE_ROLE) {
    _pause();
  }

  function unpause() external onlyRole(IMMEDIATE_ROLE) {
    _unpause();
  }

  function paused() public view virtual override(IDCAHubConfigHandler, Pausable) returns (bool) {
    return super.paused();
  }

  // solhint-disable-next-line func-name-mixedcase
  function FEE_PRECISION() public pure returns (uint32) {
    return FeeMath.FEE_PRECISION;
  }

  function _validateFee(uint32 _fee) internal view {
    if (_fee > MAX_FEE) revert HighFee();
    if (_fee % 100 != 0) revert InvalidFee();
  }
}
