//SPDX-License-Identifier: Unlicense
pragma solidity 0.7.0;

import '@openzeppelin/contracts/utils/EnumerableSet.sol';

interface IDCAFactoryParameters {
  event FeeRecipientSet(address _feeRecipient);
  event SwapIntervalsAllowed(uint256[] _swapIntervals);
  event SwapIntervalsForbidden(uint256[] _swapIntervals);

  /* Public getters */

  function feeRecipient() external view returns (address);

  function isSwapIntervalAllowed(uint256 _swapInterval) external view returns (bool);

  /* Public setters */
  function setFeeRecipient(address _feeRecipient) external;

  function addSwapIntervalsToAllowedList(uint256[] calldata _swapIntervals) external;

  function removeSwapIntervalsFromAllowedList(uint256[] calldata _swapIntervals) external;
}

abstract contract DCAFactoryParameters is IDCAFactoryParameters {
  using EnumerableSet for EnumerableSet.UintSet;

  address public override feeRecipient;
  EnumerableSet.UintSet _allowedSwapIntervals; // TODO: check if callable from outside

  constructor(address _feeRecipient) {
    _setFeeRecipient(_feeRecipient);
  }

  function _setFeeRecipient(address _feeRecipient) internal {
    require(_feeRecipient != address(0), 'DCAFactory: zero-address');
    feeRecipient = _feeRecipient;
    emit FeeRecipientSet(_feeRecipient);
  }

  function _addSwapIntervalsToAllowedList(uint256[] calldata _swapIntervals) internal {
    for (uint256 i = 0; i < _swapIntervals.length; i++) {
      require(_swapIntervals[i] > 0, 'DCAFactory: zero-interval');
      require(!isSwapIntervalAllowed(_swapIntervals[i]), 'DCAFactory: allowed-swap-interval');
      _allowedSwapIntervals.add(_swapIntervals[i]);
    }
    emit SwapIntervalsAllowed(_swapIntervals);
  }

  function _removeSwapIntervalsFromAllowedList(uint256[] calldata _swapIntervals) internal {
    for (uint256 i = 0; i < _swapIntervals.length; i++) {
      require(isSwapIntervalAllowed(_swapIntervals[i]), 'DCAFactory: swap-interval-not-allowed');
      _allowedSwapIntervals.remove(_swapIntervals[i]);
    }
    emit SwapIntervalsForbidden(_swapIntervals);
  }

  function isSwapIntervalAllowed(uint256 _swapInterval) public view override returns (bool) {
    return _allowedSwapIntervals.contains(_swapInterval);
  }
}
