// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.6;

import '../../DCAPermissionsManager/DCAPermissionsManager.sol';

contract DCAPermissionsManagerMock is DCAPermissionsManager {
  using EnumerableSet for EnumerableSet.AddressSet;

  function operators(uint256 _id) external view returns (address[] memory _operators) {
    _operators = _tokens[_id].operators.values();
  }
}
