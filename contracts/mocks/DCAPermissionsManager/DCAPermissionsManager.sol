// SPDX-License-Identifier: UNLICENSED

pragma solidity >=0.8.7 <0.9.0;

import '../../DCAPermissionsManager/DCAPermissionsManager.sol';

contract DCAPermissionsManagerMock is DCAPermissionsManager {
  struct ModifyCall {
    uint256 tokenId;
    PermissionSet[] permissionSets;
  }

  uint256 private _blockNumber;
  ModifyCall[] private _modifyCalls;

  constructor(address _governor, IDCAHubPositionDescriptor _descriptor) DCAPermissionsManager(_governor, _descriptor) {}

  function getModifyCalls() external view returns (ModifyCall[] memory) {
    return _modifyCalls;
  }

  function modify(uint256 _id, PermissionSet[] calldata _permissions) public override {
    _modifyCalls.push();
    _modifyCalls[_modifyCalls.length - 1].tokenId = _id;
    for (uint256 i = 0; i < _permissions.length; i++) {
      _modifyCalls[_modifyCalls.length - 1].permissionSets.push(_permissions[i]);
    }
    super.modify(_id, _permissions);
  }

  function setBlockNumber(uint256 __blockNumber) external {
    _blockNumber = __blockNumber;
  }

  function burnCounter() external view returns (uint256) {
    return _burnCounter;
  }

  function _getBlockNumber() internal view override returns (uint256) {
    if (_blockNumber > 0) {
      return _blockNumber;
    } else {
      return super._getBlockNumber();
    }
  }
}
