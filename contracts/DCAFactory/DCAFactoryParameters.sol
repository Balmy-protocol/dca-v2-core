//SPDX License Identifier: Unlicense
pragma solidity 0.8.4;

import '@openzeppelin/contracts/utils/structs/EnumerableSet.sol';

interface IDCAFactoryParameters {
  event FeeRecipientSet(address _feeRecipient);
  event FeeSet(uint256 _feeSet);
  event SwapIntervalsAllowed(uint256[] _swapIntervals);
  event SwapIntervalsForbidden(uint256[] _swapIntervals);

  /* Public getters */

  function feeRecipient() external view returns (address);

  function fee() external view returns (uint256);

  // solhint-disable-next-line func-name-mixedcase
  function FEE_PRECISION() external view returns (uint256);

  // solhint-disable-next-line func-name-mixedcase
  function MAX_FEE() external view returns (uint256);

  function allowedSwapIntervals() external view returns (uint256[] memory __allowedSwapIntervals);

  function isSwapIntervalAllowed(uint256 _swapInterval) external view returns (bool);

  /* Public setters */
  function setFeeRecipient(address _feeRecipient) external;

  function setFee(uint256 _fee) external;

  function addSwapIntervalsToAllowedList(uint256[] calldata _swapIntervals) external;

  function removeSwapIntervalsFromAllowedList(uint256[] calldata _swapIntervals) external;
}

abstract contract DCAFactoryParameters is IDCAFactoryParameters {
  using EnumerableSet for EnumerableSet.UintSet;

  address public override feeRecipient;
  uint256 public override fee = 2000; // 0.2%
  uint256 public constant override FEE_PRECISION = 10000;
  uint256 public constant override MAX_FEE = 10 * FEE_PRECISION; // 10%
  EnumerableSet.UintSet internal _allowedSwapIntervals;

  constructor(address _feeRecipient) {
    _setFeeRecipient(_feeRecipient);
  }

  function _setFeeRecipient(address _feeRecipient) internal {
    require(_feeRecipient != address(0), 'DCAFactory: zero address');
    feeRecipient = _feeRecipient;
    emit FeeRecipientSet(_feeRecipient);
  }

  function _setFee(uint256 _fee) internal {
    require(_fee <= MAX_FEE, 'DCAFactory: fee too high');
    fee = _fee;
    emit FeeSet(_fee);
  }

  function _addSwapIntervalsToAllowedList(uint256[] calldata _swapIntervals) internal {
    for (uint256 i = 0; i < _swapIntervals.length; i++) {
      require(_swapIntervals[i] > 0, 'DCAFactory: zero interval');
      require(!isSwapIntervalAllowed(_swapIntervals[i]), 'DCAFactory: allowed swap interval');
      _allowedSwapIntervals.add(_swapIntervals[i]);
    }
    emit SwapIntervalsAllowed(_swapIntervals);
  }

  function _removeSwapIntervalsFromAllowedList(uint256[] calldata _swapIntervals) internal {
    for (uint256 i = 0; i < _swapIntervals.length; i++) {
      require(isSwapIntervalAllowed(_swapIntervals[i]), 'DCAFactory: swap interval not allowed');
      _allowedSwapIntervals.remove(_swapIntervals[i]);
    }
    emit SwapIntervalsForbidden(_swapIntervals);
  }

  function allowedSwapIntervals() external view override returns (uint256[] memory __allowedSwapIntervals) {
    uint256 _allowedSwapIntervalsLength = _allowedSwapIntervals.length();
    __allowedSwapIntervals = new uint256[](_allowedSwapIntervalsLength);
    for (uint256 i = 0; i < _allowedSwapIntervalsLength; i++) {
      __allowedSwapIntervals[i] = _allowedSwapIntervals.at(i);
    }
  }

  function isSwapIntervalAllowed(uint256 _swapInterval) public view override returns (bool) {
    return _allowedSwapIntervals.contains(_swapInterval);
  }
}
