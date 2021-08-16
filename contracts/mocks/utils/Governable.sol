// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.6;

import '../../utils/Governable.sol';

contract GovernableMock is Governable {
  constructor(address _governor) Governable(_governor) {}

  function onlyGovernorAllowed() external onlyGovernor {}

  function onlyPendingGovernorAllowed() external onlyPendingGovernor {}

  function setPendingGovernorInternal(address _pendingGovernor) external {
    _setPendingGovernor(_pendingGovernor);
  }

  function acceptPendingGovernorInternal() external {
    _acceptPendingGovernor();
  }
}
