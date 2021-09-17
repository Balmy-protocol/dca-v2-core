// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.6;

import '../../DCAPermissionsManager/DCAPermissionsManager.sol';

contract DCAPermissionsManagerMock is DCAPermissionsManager {
  using EnumerableSet for EnumerableSet.AddressSet;

  function operators(uint256 _id) external view returns (address[] memory _operatorList) {
    _operatorList = new address[](_operators[_id].length());
    for (uint256 i; i < _operatorList.length; i++) {
      _operatorList[i] = _operators[_id].at(i);
    }
  }
}
