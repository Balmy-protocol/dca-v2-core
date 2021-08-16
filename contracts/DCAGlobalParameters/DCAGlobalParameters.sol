// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.6;

import '@openzeppelin/contracts/utils/structs/EnumerableSet.sol';
import '@openzeppelin/contracts/access/AccessControl.sol';
import '@openzeppelin/contracts/security/Pausable.sol';

import '../interfaces/IDCAGlobalParameters.sol';
import '../libraries/CommonErrors.sol';

contract DCAGlobalParameters is IDCAGlobalParameters, AccessControl, Pausable {
  using EnumerableSet for EnumerableSet.UintSet;

  bytes32 public constant IMMEDIATE_ROLE = keccak256('IMMEDIATE_ROLE');
  bytes32 public constant TIME_LOCKED_ROLE = keccak256('TIME_LOCKED_ROLE');

  address public override feeRecipient;
  IDCATokenDescriptor public override nftDescriptor;
  ITimeWeightedOracle public override oracle;
  uint32 public override swapFee = 6000; // 0.6%
  uint32 public override loanFee = 1000; // 0.1%
  uint24 public constant override FEE_PRECISION = 10000;
  uint32 public constant override MAX_FEE = 10 * FEE_PRECISION; // 10%
  mapping(uint32 => string) public override intervalDescription;
  EnumerableSet.UintSet internal _allowedSwapIntervals;

  constructor(
    address _immediateGovernor,
    address _timeLockedGovernor,
    address _feeRecipient,
    IDCATokenDescriptor _nftDescriptor,
    ITimeWeightedOracle _oracle
  ) {
    if (
      _immediateGovernor == address(0) ||
      _timeLockedGovernor == address(0) ||
      _feeRecipient == address(0) ||
      address(_nftDescriptor) == address(0) ||
      address(_oracle) == address(0)
    ) revert CommonErrors.ZeroAddress();
    _setupRole(IMMEDIATE_ROLE, _immediateGovernor);
    _setupRole(TIME_LOCKED_ROLE, _timeLockedGovernor);
    // We set each role as its own admin, so they can assign new addresses with the same role
    _setRoleAdmin(IMMEDIATE_ROLE, IMMEDIATE_ROLE);
    _setRoleAdmin(TIME_LOCKED_ROLE, TIME_LOCKED_ROLE);
    feeRecipient = _feeRecipient;
    nftDescriptor = _nftDescriptor;
    oracle = _oracle;
  }

  function setFeeRecipient(address _feeRecipient) external override onlyRole(IMMEDIATE_ROLE) {
    if (_feeRecipient == address(0)) revert CommonErrors.ZeroAddress();
    feeRecipient = _feeRecipient;
    emit FeeRecipientSet(_feeRecipient);
  }

  function setNFTDescriptor(IDCATokenDescriptor _descriptor) external override onlyRole(IMMEDIATE_ROLE) {
    if (address(_descriptor) == address(0)) revert CommonErrors.ZeroAddress();
    nftDescriptor = _descriptor;
    emit NFTDescriptorSet(_descriptor);
  }

  function setOracle(ITimeWeightedOracle _oracle) external override onlyRole(TIME_LOCKED_ROLE) {
    if (address(_oracle) == address(0)) revert CommonErrors.ZeroAddress();
    oracle = _oracle;
    emit OracleSet(_oracle);
  }

  function setSwapFee(uint32 _swapFee) external override onlyRole(TIME_LOCKED_ROLE) {
    if (_swapFee > MAX_FEE) revert HighFee();
    swapFee = _swapFee;
    emit SwapFeeSet(_swapFee);
  }

  function setLoanFee(uint32 _loanFee) external override onlyRole(TIME_LOCKED_ROLE) {
    if (_loanFee > MAX_FEE) revert HighFee();
    loanFee = _loanFee;
    emit LoanFeeSet(_loanFee);
  }

  function addSwapIntervalsToAllowedList(uint32[] calldata _swapIntervals, string[] calldata _descriptions)
    external
    override
    onlyRole(IMMEDIATE_ROLE)
  {
    if (_swapIntervals.length != _descriptions.length) revert InvalidParams();
    for (uint256 i; i < _swapIntervals.length; i++) {
      if (_swapIntervals[i] == 0) revert ZeroInterval();
      if (bytes(_descriptions[i]).length == 0) revert EmptyDescription();
      _allowedSwapIntervals.add(_swapIntervals[i]);
      intervalDescription[_swapIntervals[i]] = _descriptions[i];
    }
    emit SwapIntervalsAllowed(_swapIntervals, _descriptions);
  }

  function removeSwapIntervalsFromAllowedList(uint32[] calldata _swapIntervals) external override onlyRole(IMMEDIATE_ROLE) {
    for (uint256 i; i < _swapIntervals.length; i++) {
      _allowedSwapIntervals.remove(_swapIntervals[i]);
      delete intervalDescription[_swapIntervals[i]];
    }
    emit SwapIntervalsForbidden(_swapIntervals);
  }

  function allowedSwapIntervals() external view override returns (uint32[] memory __allowedSwapIntervals) {
    uint256 _allowedSwapIntervalsLength = _allowedSwapIntervals.length();
    __allowedSwapIntervals = new uint32[](_allowedSwapIntervalsLength);
    for (uint256 i; i < _allowedSwapIntervalsLength; i++) {
      __allowedSwapIntervals[i] = uint32(_allowedSwapIntervals.at(i));
    }
  }

  function isSwapIntervalAllowed(uint32 _swapInterval) external view override returns (bool) {
    return _allowedSwapIntervals.contains(_swapInterval);
  }

  function paused() public view override(IDCAGlobalParameters, Pausable) returns (bool) {
    return super.paused();
  }

  function pause() external override onlyRole(IMMEDIATE_ROLE) {
    _pause();
  }

  function unpause() external override onlyRole(IMMEDIATE_ROLE) {
    _unpause();
  }

  function loanParameters() external view override returns (LoanParameters memory _loanParameters) {
    _loanParameters.feeRecipient = feeRecipient;
    _loanParameters.isPaused = paused();
    _loanParameters.loanFee = loanFee;
  }

  function swapParameters() external view override returns (SwapParameters memory _swapParameters) {
    _swapParameters.feeRecipient = feeRecipient;
    _swapParameters.isPaused = paused();
    _swapParameters.swapFee = swapFee;
    _swapParameters.oracle = oracle;
  }
}
