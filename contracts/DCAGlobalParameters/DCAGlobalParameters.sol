// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.4;

import '@openzeppelin/contracts/utils/structs/EnumerableSet.sol';
import '@openzeppelin/contracts/security/Pausable.sol';

import '../utils/Governable.sol';
import '../interfaces/IDCAGlobalParameters.sol';
import '../libraries/CommonErrors.sol';

contract DCAGlobalParameters is IDCAGlobalParameters, Governable, Pausable {
  using EnumerableSet for EnumerableSet.UintSet;

  address public override feeRecipient;
  IDCATokenDescriptor public override nftDescriptor;
  uint32 public override swapFee = 3000; // 0.3%
  uint32 public override loanFee = 1000; // 0.1%
  uint24 public constant override FEE_PRECISION = 10000;
  uint32 public constant override MAX_FEE = 10 * FEE_PRECISION; // 10%
  mapping(uint32 => string) public override intervalDescription;
  EnumerableSet.UintSet internal _allowedSwapIntervals;

  constructor(
    address _governor,
    address _feeRecipient,
    IDCATokenDescriptor _nftDescriptor
  ) Governable(_governor) {
    if (_feeRecipient == address(0)) revert CommonErrors.ZeroAddress();
    if (address(_nftDescriptor) == address(0)) revert CommonErrors.ZeroAddress();
    feeRecipient = _feeRecipient;
    nftDescriptor = _nftDescriptor;
  }

  function setFeeRecipient(address _feeRecipient) public override onlyGovernor {
    if (_feeRecipient == address(0)) revert CommonErrors.ZeroAddress();
    feeRecipient = _feeRecipient;
    emit FeeRecipientSet(_feeRecipient);
  }

  function setNFTDescriptor(IDCATokenDescriptor _descriptor) public override onlyGovernor {
    if (address(_descriptor) == address(0)) revert CommonErrors.ZeroAddress();
    nftDescriptor = _descriptor;
    emit NFTDescriptorSet(_descriptor);
  }

  function setSwapFee(uint32 _swapFee) public override onlyGovernor {
    if (_swapFee > MAX_FEE) revert HighFee();
    swapFee = _swapFee;
    emit SwapFeeSet(_swapFee);
  }

  function setLoanFee(uint32 _loanFee) public override onlyGovernor {
    if (_loanFee > MAX_FEE) revert HighFee();
    loanFee = _loanFee;
    emit LoanFeeSet(_loanFee);
  }

  function addSwapIntervalsToAllowedList(uint32[] calldata _swapIntervals, string[] calldata _descriptions) public override onlyGovernor {
    if (_swapIntervals.length != _descriptions.length) revert InvalidParams();
    for (uint256 i; i < _swapIntervals.length; i++) {
      if (_swapIntervals[i] == 0) revert ZeroInterval();
      if (bytes(_descriptions[i]).length == 0) revert EmptyDescription();
      if (isSwapIntervalAllowed(_swapIntervals[i])) revert AllowedInterval();
      _allowedSwapIntervals.add(_swapIntervals[i]);
      intervalDescription[_swapIntervals[i]] = _descriptions[i];
    }
    emit SwapIntervalsAllowed(_swapIntervals, _descriptions);
  }

  function removeSwapIntervalsFromAllowedList(uint32[] calldata _swapIntervals) public override onlyGovernor {
    for (uint256 i; i < _swapIntervals.length; i++) {
      if (!isSwapIntervalAllowed(_swapIntervals[i])) revert InvalidInterval();
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

  function isSwapIntervalAllowed(uint32 _swapInterval) public view override returns (bool) {
    return _allowedSwapIntervals.contains(_swapInterval);
  }

  function paused() public view override(IDCAGlobalParameters, Pausable) returns (bool) {
    return super.paused();
  }

  function pause() public override onlyGovernor {
    _pause();
  }

  function unpause() public override onlyGovernor {
    _unpause();
  }

  function loanParameters() public view override returns (LoanParameters memory _loanParameters) {
    _loanParameters.feeRecipient = feeRecipient;
    _loanParameters.isPaused = paused();
    _loanParameters.loanFee = loanFee;
  }

  function swapParameters() public view override returns (SwapParameters memory _swapParameters) {
    _swapParameters.feeRecipient = feeRecipient;
    _swapParameters.isPaused = paused();
    _swapParameters.swapFee = swapFee;
  }
}
