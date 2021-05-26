// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

import '@openzeppelin/contracts/utils/structs/EnumerableSet.sol';
import '../utils/Governable.sol';
import '../interfaces/IDCAFactory.sol';

abstract contract DCAFactoryParameters is IDCAFactoryParameters, Governable {
  using EnumerableSet for EnumerableSet.UintSet;

  address public override feeRecipient;
  uint32 public override fee = 3000; // 0.3%
  uint24 public constant override FEE_PRECISION = 10000;
  uint32 public constant override MAX_FEE = 10 * FEE_PRECISION; // 10%
  EnumerableSet.UintSet internal _allowedSwapIntervals;

  constructor(address _governor, address _feeRecipient) Governable(_governor) {
    setFeeRecipient(_feeRecipient);
  }

  function setFeeRecipient(address _feeRecipient) public override onlyGovernor {
    require(_feeRecipient != address(0), 'DCAFactory: zero address');
    feeRecipient = _feeRecipient;
    emit FeeRecipientSet(_feeRecipient);
  }

  function setFee(uint32 _fee) public override onlyGovernor {
    require(_fee <= MAX_FEE, 'DCAFactory: fee too high');
    fee = _fee;
    emit FeeSet(_fee);
  }

  function addSwapIntervalsToAllowedList(uint32[] calldata _swapIntervals) public override onlyGovernor {
    for (uint256 i = 0; i < _swapIntervals.length; i++) {
      require(_swapIntervals[i] > 0, 'DCAFactory: zero interval');
      require(!isSwapIntervalAllowed(_swapIntervals[i]), 'DCAFactory: already allowed');
      _allowedSwapIntervals.add(_swapIntervals[i]);
    }
    emit SwapIntervalsAllowed(_swapIntervals);
  }

  function removeSwapIntervalsFromAllowedList(uint32[] calldata _swapIntervals) public override onlyGovernor {
    for (uint256 i = 0; i < _swapIntervals.length; i++) {
      require(isSwapIntervalAllowed(_swapIntervals[i]), 'DCAFactory: invalid interval');
      _allowedSwapIntervals.remove(_swapIntervals[i]);
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
}
