// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.6;

import '../../DCAPermissionsManager/DCAPermissionsManager.sol';

contract DCAPermissionsManagerMock is DCAPermissionsManager {
  using EnumerableSet for EnumerableSet.AddressSet;

  function operators(uint256 _id) external view returns (address[] memory _operators) {
    _operators = new address[](_tokens[_id].operators.length());
    for (uint256 i; i < _operators.length; i++) {
      _operators[i] = _tokens[_id].operators.at(i);
    }
  }
}
