// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '../interfaces/IDCAPermissionManager.sol';

library PermissionMath {
  function toUInt8(IDCAPermissionManager.Permission[] memory _permissions) internal pure returns (uint8 _representation) {
    for (uint256 i; i < _permissions.length; i++) {
      _representation += uint8(2**uint8(_permissions[i]));
    }
  }

  function hasPermission(uint8 _representation, IDCAPermissionManager.Permission _permission) internal pure returns (bool) {
    uint256 _bitMask = 2**uint256(_permission);
    return (_representation & _bitMask) == _bitMask;
  }
}
