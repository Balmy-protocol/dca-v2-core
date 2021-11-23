// SPDX-License-Identifier: BUSL-1.1
pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/access/AccessControl.sol';
import '@openzeppelin/contracts/security/Pausable.sol';
import '../interfaces/oracles/IPriceOracle.sol';
import '../libraries/Intervals.sol';
import '../libraries/FeeMath.sol';
import './DCAHubParameters.sol';

abstract contract DCAHubConfigHandler is DCAHubParameters, AccessControl, Pausable, IDCAHubConfigHandler {
  // Internal constants (all should be constants, but apparently the byte code size increases when they are)
  // solhint-disable var-name-mixedcase
  bytes32 public IMMEDIATE_ROLE = keccak256('IMMEDIATE_ROLE');
  bytes32 public TIME_LOCKED_ROLE = keccak256('TIME_LOCKED_ROLE');
  bytes32 public PLATFORM_WITHDRAW_ROLE = keccak256('PLATFORM_WITHDRAW_ROLE');
  // solhint-enable var-name-mixedcase
  /// @inheritdoc IDCAHubConfigHandler
  uint32 public constant MAX_FEE = 100000; // 10%
  /// @inheritdoc IDCAHubConfigHandler
  uint16 public constant MAX_PLATFORM_FEE_RATIO = 10000;

  /// @inheritdoc IDCAHubConfigHandler
  IPriceOracle public oracle;
  /// @inheritdoc IDCAHubConfigHandler
  uint32 public swapFee = 6000; // 0.6%
  /// @inheritdoc IDCAHubConfigHandler
  uint32 public loanFee = 100; // 0.01%
  /// @inheritdoc IDCAHubConfigHandler
  bytes1 public allowedSwapIntervals = 0xF0; // Start allowing weekly, daily, every 4 hours, hourly
  /// @inheritdoc IDCAHubConfigHandler
  uint16 public platformFeeRatio = 2500; // 25%

  constructor(
    address _immediateGovernor,
    address _timeLockedGovernor,
    IPriceOracle _oracle
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

  /// @inheritdoc IDCAHubConfigHandler
  function setOracle(IPriceOracle _oracle) external onlyRole(TIME_LOCKED_ROLE) {
    _assertNonZeroAddress(address(_oracle));
    oracle = _oracle;
    emit OracleSet(_oracle);
  }

  /// @inheritdoc IDCAHubConfigHandler
  function setSwapFee(uint32 _swapFee) external onlyRole(TIME_LOCKED_ROLE) {
    _validateFee(_swapFee);
    swapFee = _swapFee;
    emit SwapFeeSet(_swapFee);
  }

  /// @inheritdoc IDCAHubConfigHandler
  function setLoanFee(uint32 _loanFee) external onlyRole(TIME_LOCKED_ROLE) {
    _validateFee(_loanFee);
    loanFee = _loanFee;
    emit LoanFeeSet(_loanFee);
  }

  /// @inheritdoc IDCAHubConfigHandler
  function setPlatformFeeRatio(uint16 _platformFeeRatio) external onlyRole(TIME_LOCKED_ROLE) {
    if (_platformFeeRatio > MAX_PLATFORM_FEE_RATIO) revert HighPlatformFeeRatio();
    platformFeeRatio = _platformFeeRatio;
    emit PlatformFeeRatioSet(_platformFeeRatio);
  }

  /// @inheritdoc IDCAHubConfigHandler
  function addSwapIntervalsToAllowedList(uint32[] calldata _swapIntervals) external onlyRole(IMMEDIATE_ROLE) {
    for (uint256 i; i < _swapIntervals.length; i++) {
      allowedSwapIntervals |= Intervals.intervalToMask(_swapIntervals[i]);
    }
    emit SwapIntervalsAllowed(_swapIntervals);
  }

  /// @inheritdoc IDCAHubConfigHandler
  function removeSwapIntervalsFromAllowedList(uint32[] calldata _swapIntervals) external onlyRole(IMMEDIATE_ROLE) {
    for (uint256 i; i < _swapIntervals.length; i++) {
      allowedSwapIntervals &= ~Intervals.intervalToMask(_swapIntervals[i]);
    }
    emit SwapIntervalsForbidden(_swapIntervals);
  }

  /// @inheritdoc IDCAHubConfigHandler
  function pause() external onlyRole(IMMEDIATE_ROLE) {
    _pause();
  }

  /// @inheritdoc IDCAHubConfigHandler
  function unpause() external onlyRole(IMMEDIATE_ROLE) {
    _unpause();
  }

  /// @inheritdoc IDCAHubConfigHandler
  function paused() public view virtual override(IDCAHubConfigHandler, Pausable) returns (bool) {
    return super.paused();
  }

  function _validateFee(uint32 _fee) internal pure {
    if (_fee > MAX_FEE) revert HighFee();
    if (_fee % 100 != 0) revert InvalidFee();
  }
}
