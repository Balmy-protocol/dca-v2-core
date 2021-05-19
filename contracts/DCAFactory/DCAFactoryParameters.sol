// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

import '@openzeppelin/contracts/utils/structs/EnumerableSet.sol';

interface IDCAFactoryParameters {
  event FeeRecipientSet(address _feeRecipient);
  event FeeSet(uint32 _feeSet);
  event SwapIntervalsAllowed(uint32[] _swapIntervals);
  event SwapIntervalsForbidden(uint32[] _swapIntervals);

  /* Public getters */

  function feeRecipient() external view returns (address);

  function fee() external view returns (uint32);

  // solhint-disable-next-line func-name-mixedcase
  function FEE_PRECISION() external view returns (uint24);

  // solhint-disable-next-line func-name-mixedcase
  function MAX_FEE() external view returns (uint32);

  function allowedSwapIntervals() external view returns (uint32[] memory __allowedSwapIntervals); // uint32 is enough for 100 years

  function isSwapIntervalAllowed(uint32 _swapInterval) external view returns (bool);

  /* Public setters */
  function setFeeRecipient(address _feeRecipient) external;

  function setFee(uint32 _fee) external;

  function addSwapIntervalsToAllowedList(uint32[] calldata _swapIntervals) external;

  function removeSwapIntervalsFromAllowedList(uint32[] calldata _swapIntervals) external;
}

abstract contract DCAFactoryParameters is IDCAFactoryParameters {
  using EnumerableSet for EnumerableSet.UintSet;

  address public override feeRecipient;
  uint32 public override fee = 3000; // 0.3%
  uint24 public constant override FEE_PRECISION = 10000;
  uint32 public constant override MAX_FEE = 10 * FEE_PRECISION; // 10%
  EnumerableSet.UintSet internal _allowedSwapIntervals;

  constructor(address _feeRecipient) {
    _setFeeRecipient(_feeRecipient);
  }

  function _setFeeRecipient(address _feeRecipient) internal {
    require(_feeRecipient != address(0), 'DCAFactory: zero address');
    feeRecipient = _feeRecipient;
    emit FeeRecipientSet(_feeRecipient);
  }

  function _setFee(uint32 _fee) internal {
    require(_fee <= MAX_FEE, 'DCAFactory: fee too high');
    fee = _fee;
    emit FeeSet(_fee);
  }

  function _addSwapIntervalsToAllowedList(uint32[] calldata _swapIntervals) internal {
    for (uint256 i = 0; i < _swapIntervals.length; i++) {
      require(_swapIntervals[i] > 0, 'DCAFactory: zero interval');
      require(!isSwapIntervalAllowed(_swapIntervals[i]), 'DCAFactory: allowed swap interval');
      _allowedSwapIntervals.add(_swapIntervals[i]);
    }
    emit SwapIntervalsAllowed(_swapIntervals);
  }

  function _removeSwapIntervalsFromAllowedList(uint32[] calldata _swapIntervals) internal {
    for (uint256 i = 0; i < _swapIntervals.length; i++) {
      require(isSwapIntervalAllowed(_swapIntervals[i]), 'DCAFactory: swap interval not allowed');
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
