// SPDX-License-Identifier: BUSL-1.1
pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/token/ERC721/ERC721.sol';
import '@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol';
import '../interfaces/IDCATokenDescriptor.sol';
import '../interfaces/IDCAPermissionManager.sol';
import '../libraries/PermissionMath.sol';
import '../utils/Governable.sol';

// Note: ideally, this would be part of the DCAHub. However, since we've reached the max bytecode size, we needed to make it its own contract
contract DCAPermissionsManager is ERC721, EIP712, Governable, IDCAPermissionManager {
  struct InternalPermission {
    uint8 permissions;
    uint32 lastUpdated;
  }

  using PermissionMath for Permission[];
  using PermissionMath for uint8;

  /// @inheritdoc IDCAPermissionManager
  bytes32 public constant PERMIT_TYPEHASH = keccak256('Permit(address spender,uint256 tokenId,uint256 nonce,uint256 deadline)');
  /// @inheritdoc IDCAPermissionManager
  bytes32 public constant PERMISSION_PERMIT_TYPEHASH =
    keccak256(
      'PermissionPermit(PermissionSet[] permissions,uint256 tokenId,uint256 nonce,uint256 deadline)PermissionSet(address operator,uint8[] permissions)'
    );
  /// @inheritdoc IDCAPermissionManager
  bytes32 public constant PERMISSION_SET_TYPEHASH = keccak256('PermissionSet(address operator,uint8[] permissions)');
  /// @inheritdoc IDCAPermissionManager
  IDCATokenDescriptor public nftDescriptor;
  /// @inheritdoc IDCAPermissionManager
  address public hub;
  /// @inheritdoc IDCAPermissionManager
  mapping(address => uint256) public nonces;
  mapping(uint256 => uint32) public lastOwnershipChange;
  mapping(uint256 => mapping(address => InternalPermission)) internal _tokenPermissions;

  constructor(address _governor, IDCATokenDescriptor _descriptor)
    ERC721('Mean Finance DCA', 'DCA')
    EIP712('Mean Finance DCA', '1')
    Governable(_governor)
  {
    if (address(_descriptor) == address(0)) revert ZeroAddress();
    nftDescriptor = _descriptor;
  }

  /// @inheritdoc IDCAPermissionManager
  function setHub(address _hub) external {
    if (_hub == address(0)) revert ZeroAddress();
    if (hub != address(0)) revert HubAlreadySet();
    hub = _hub;
  }

  /// @inheritdoc IDCAPermissionManager
  function mint(
    uint256 _id,
    address _owner,
    PermissionSet[] calldata _permissions
  ) external {
    if (msg.sender != hub) revert OnlyHubCanExecute();
    _mint(_owner, _id);
    _setPermissions(_id, _permissions);
  }

  /// @inheritdoc IDCAPermissionManager
  function hasPermission(
    uint256 _id,
    address _address,
    Permission _permission
  ) external view returns (bool) {
    if (ownerOf(_id) == _address) {
      return true;
    }
    InternalPermission memory _internalPermission = _tokenPermissions[_id][_address];
    // If there was an ownership change after the permission was last updated, then the address doesn't have the permission
    return _internalPermission.permissions.hasPermission(_permission) && lastOwnershipChange[_id] <= _internalPermission.lastUpdated;
  }

  /// @inheritdoc IDCAPermissionManager
  function burn(uint256 _id) external {
    if (msg.sender != hub) revert OnlyHubCanExecute();
    _burn(_id);
  }

  /// @inheritdoc IDCAPermissionManager
  function modify(uint256 _id, PermissionSet[] calldata _permissions) external {
    if (msg.sender != ownerOf(_id)) revert NotOwner();
    _modify(_id, _permissions);
  }

  /// @inheritdoc IDCAPermissionManager
  // solhint-disable-next-line func-name-mixedcase
  function DOMAIN_SEPARATOR() external view returns (bytes32) {
    return _domainSeparatorV4();
  }

  /// @inheritdoc IDCAPermissionManager
  function permit(
    address _spender,
    uint256 _tokenId,
    uint256 _deadline,
    uint8 _v,
    bytes32 _r,
    bytes32 _s
  ) external {
    if (block.timestamp > _deadline) revert ExpiredDeadline();

    address _owner = ownerOf(_tokenId);
    bytes32 _structHash = keccak256(abi.encode(PERMIT_TYPEHASH, _spender, _tokenId, nonces[_owner]++, _deadline));
    bytes32 _hash = _hashTypedDataV4(_structHash);

    address _signer = ECDSA.recover(_hash, _v, _r, _s);
    if (_signer != _owner) revert InvalidSignature();

    _approve(_spender, _tokenId);
  }

  /// @inheritdoc IDCAPermissionManager
  function permissionPermit(
    PermissionSet[] calldata _permissions,
    uint256 _tokenId,
    uint256 _deadline,
    uint8 _v,
    bytes32 _r,
    bytes32 _s
  ) external {
    if (block.timestamp > _deadline) revert ExpiredDeadline();

    address _owner = ownerOf(_tokenId);
    bytes32 _structHash = keccak256(
      abi.encode(PERMISSION_PERMIT_TYPEHASH, keccak256(_encode(_permissions)), _tokenId, nonces[_owner]++, _deadline)
    );
    bytes32 _hash = _hashTypedDataV4(_structHash);

    address _signer = ECDSA.recover(_hash, _v, _r, _s);
    if (_signer != _owner) revert InvalidSignature();

    _modify(_tokenId, _permissions);
  }

  /// @inheritdoc IDCAPermissionManager
  function setNFTDescriptor(IDCATokenDescriptor _descriptor) external onlyGovernor {
    if (address(_descriptor) == address(0)) revert ZeroAddress();
    nftDescriptor = _descriptor;
    emit NFTDescriptorSet(_descriptor);
  }

  /// @inheritdoc ERC721
  function tokenURI(uint256 _tokenId) public view override returns (string memory) {
    return nftDescriptor.tokenURI(hub, _tokenId);
  }

  function _encode(PermissionSet[] calldata _permissions) internal pure returns (bytes memory _result) {
    for (uint256 i; i < _permissions.length; i++) {
      _result = bytes.concat(_result, keccak256(_encode(_permissions[i])));
    }
  }

  function _encode(PermissionSet calldata _permission) internal pure returns (bytes memory _result) {
    _result = abi.encode(PERMISSION_SET_TYPEHASH, _permission.operator, keccak256(_encode(_permission.permissions)));
  }

  function _encode(Permission[] calldata _permissions) internal pure returns (bytes memory _result) {
    _result = new bytes(_permissions.length * 32);
    for (uint256 i; i < _permissions.length; i++) {
      _result[(_permissions.length - i) * 32 - 1] = bytes1(uint8(_permissions[i]));
    }
  }

  function _modify(uint256 _id, PermissionSet[] calldata _permissions) internal {
    _setPermissions(_id, _permissions);
    emit Modified(_id, _permissions);
  }

  function _setPermissions(uint256 _id, PermissionSet[] calldata _permissions) internal {
    uint32 _blockTimestamp = uint32(block.timestamp);
    for (uint256 i; i < _permissions.length; i++) {
      if (_permissions[i].permissions.length == 0) {
        delete _tokenPermissions[_id][_permissions[i].operator];
      } else {
        _tokenPermissions[_id][_permissions[i].operator] = InternalPermission({
          permissions: _permissions[i].permissions.toUInt8(),
          lastUpdated: _blockTimestamp
        });
      }
    }
  }

  function _beforeTokenTransfer(
    address _from,
    address _to,
    uint256 _id
  ) internal override {
    if (_to == address(0)) {
      // When token is being burned, we can delete this entry on the mapping
      delete lastOwnershipChange[_id];
    } else if (_from != address(0)) {
      // If the token is being minted, then no need to write this
      lastOwnershipChange[_id] = uint32(block.timestamp);
    }
  }
}
