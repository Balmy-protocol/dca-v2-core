// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

interface IDCAGlobalParameters {
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

  function allowedSwapIntervals() external view returns (uint32[] memory __allowedSwapIntervals);

  function isSwapIntervalAllowed(uint32 _swapInterval) external view returns (bool);

  /* Public setters */
  function setFeeRecipient(address _feeRecipient) external;

  function setFee(uint32 _fee) external;

  function addSwapIntervalsToAllowedList(uint32[] calldata _swapIntervals) external;

  function removeSwapIntervalsFromAllowedList(uint32[] calldata _swapIntervals) external;
}
