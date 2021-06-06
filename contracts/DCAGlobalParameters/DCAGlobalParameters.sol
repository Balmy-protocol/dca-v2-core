// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.4;

import '@openzeppelin/contracts/utils/structs/EnumerableSet.sol';
import '@openzeppelin/contracts/security/Pausable.sol';
import '../utils/Governable.sol';
import '../interfaces/IDCAGlobalParameters.sol';

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
    setFeeRecipient(_feeRecipient);
    setNFTDescriptor(_nftDescriptor);
  }

  function setFeeRecipient(address _feeRecipient) public override onlyGovernor {
    require(_feeRecipient != address(0), 'DCAGParameters: zero address');
    feeRecipient = _feeRecipient;
    emit FeeRecipientSet(_feeRecipient);
  }

  function setNFTDescriptor(IDCATokenDescriptor _descriptor) public override onlyGovernor {
    require(address(_descriptor) != address(0), 'DCAGParameters: zero address');
    nftDescriptor = _descriptor;
    emit NFTDescriptorSet(_descriptor);
  }

  function setSwapFee(uint32 _swapFee) public override onlyGovernor {
    require(_swapFee <= MAX_FEE, 'DCAGParameters: fee too high');
    swapFee = _swapFee;
    emit SwapFeeSet(_swapFee);
  }

  function setLoanFee(uint32 _loanFee) public override onlyGovernor {
    require(_loanFee <= MAX_FEE, 'DCAGParameters: fee too high');
    loanFee = _loanFee;
    emit LoanFeeSet(_loanFee);
  }

  function addSwapIntervalsToAllowedList(uint32[] calldata _swapIntervals, string[] calldata _descriptions) public override onlyGovernor {
    require(_swapIntervals.length == _descriptions.length, 'DCAGParameters: invalid params');
    for (uint256 i = 0; i < _swapIntervals.length; i++) {
      require(_swapIntervals[i] > 0, 'DCAGParameters: zero interval');
      require(bytes(_descriptions[i]).length > 0, 'DCAGParameters: empty text');
      require(!isSwapIntervalAllowed(_swapIntervals[i]), 'DCAGParameters: already allowed');
      _allowedSwapIntervals.add(_swapIntervals[i]);
      intervalDescription[_swapIntervals[i]] = _descriptions[i];
    }
    emit SwapIntervalsAllowed(_swapIntervals, _descriptions);
  }

  function removeSwapIntervalsFromAllowedList(uint32[] calldata _swapIntervals) public override onlyGovernor {
    for (uint256 i = 0; i < _swapIntervals.length; i++) {
      require(isSwapIntervalAllowed(_swapIntervals[i]), 'DCAGParameters: invalid interval');
      _allowedSwapIntervals.remove(_swapIntervals[i]);
      delete intervalDescription[_swapIntervals[i]];
    }
    emit SwapIntervalsForbidden(_swapIntervals);
  }

  function allowedSwapIntervals() external view override returns (uint32[] memory __allowedSwapIntervals) {
    uint256 _allowedSwapIntervalsLength = _allowedSwapIntervals.length();
    __allowedSwapIntervals = new uint32[](_allowedSwapIntervalsLength);
    for (uint256 i = 0; i < _allowedSwapIntervalsLength; i++) {
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
