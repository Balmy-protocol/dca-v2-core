// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7 <0.9.0;

import '../../libraries/PermissionMath.sol';

contract PermissionMathMock {
  function toUInt8(IDCAPermissionManager.Permission[] memory _permissions) external pure returns (uint8 _representation) {
    return PermissionMath.toUInt8(_permissions);
  }

  function hasPermission(uint8 _representation, IDCAPermissionManager.Permission _permission) external pure returns (bool _hasPermission) {
    return PermissionMath.hasPermission(_representation, _permission);
  }
}
