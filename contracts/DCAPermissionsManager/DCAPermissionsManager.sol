// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.6;

// Note: ideally, this would be part of the DCAHub. However, since we've reached the max bytecode size, we needed to make it its own contract
contract DCAPermissionsManager {
  error HubAlreadySet();
  error ZeroAddress();

  address public hub;

  function setHub(address _hub) external {
    if (_hub == address(0)) revert ZeroAddress();
    if (hub != address(0)) revert HubAlreadySet();
    hub = _hub;
  }
}
