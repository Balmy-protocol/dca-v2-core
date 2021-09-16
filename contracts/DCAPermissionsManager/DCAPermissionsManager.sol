// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.6;

import '@openzeppelin/contracts/token/ERC721/ERC721.sol';

enum Permission {
  INCREASE,
  REDUCE,
  WITHDRAW,
  TERMINATE
}

library PermissionMath {
  function toUInt8(Permission[] memory _permissions) internal pure returns (uint8 _representation) {
    for (uint256 i; i < _permissions.length; i++) {
      _representation += uint8(2**uint8(_permissions[i]));
    }
  }

  function hasPermission(uint8 _representation, Permission _permission) internal pure returns (bool) {
    uint256 _bitMask = 2**uint256(_permission);
    return (_representation & _bitMask) == _bitMask;
  }
}

// Note: ideally, this would be part of the DCAHub. However, since we've reached the max bytecode size, we needed to make it its own contract
contract DCAPermissionsManager is ERC721 {
  error HubAlreadySet();
  error ZeroAddress();
  error IdAlreadyInUse();
  error OnlyHubCanMint();

  struct PermissionSet {
    address operator;
    Permission[] permissions;
  }

  event Minted(uint256 id, address owner, PermissionSet[] permissions);

  using PermissionMath for Permission[];
  using PermissionMath for uint8;

  address public hub;
  mapping(uint256 => mapping(address => uint8)) internal _operators;

  constructor() ERC721('Mean Finance DCA', 'DCA') {}

  function setHub(address _hub) external {
    if (_hub == address(0)) revert ZeroAddress();
    if (hub != address(0)) revert HubAlreadySet();
    hub = _hub;
  }

  function mint(
    uint256 _id,
    address _owner,
    PermissionSet[] calldata _permissions
  ) external {
    if (msg.sender != hub) revert OnlyHubCanMint();
    _mint(_owner, _id);
    _setPermissions(_id, _permissions);

    emit Minted(_id, _owner, _permissions);
  }

  function hasPermission(
    uint256 _id,
    address _address,
    Permission _permission
  ) external view returns (bool) {
    return ownerOf(_id) == _address || _operators[_id][_address].hasPermission(_permission);
  }

  function _setPermissions(uint256 _id, PermissionSet[] calldata _permissions) internal {
    for (uint256 i; i < _permissions.length; i++) {
      if (_permissions[i].operator == address(0)) revert ZeroAddress();
      _operators[_id][_permissions[i].operator] = _permissions[i].permissions.toUInt8();
    }
  }
}
