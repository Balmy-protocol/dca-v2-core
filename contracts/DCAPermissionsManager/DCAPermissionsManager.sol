// SPDX-License-Identifier: BUSL-1.1
pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/token/ERC721/ERC721.sol';
import '@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol';
import '../interfaces/IDCATokenDescriptor.sol';
import '../interfaces/IDCAPermissionManager.sol';
import '../libraries/PermissionMath.sol';
import '../libraries/AddressSet.sol';
import '../utils/Governable.sol';

// Note: ideally, this would be part of the DCAHub. However, since we've reached the max bytecode size, we needed to make it its own contract
contract DCAPermissionsManager is ERC721, EIP712, Governable, IDCAPermissionManager {
  struct TokenInfo {
    mapping(address => uint8) permissions;
    AddressSet.Set operators;
    // TODO: Test if avoiding enumerable set is cheaper
  }

  using PermissionMath for Permission[];
  using PermissionMath for uint8;
  using AddressSet for AddressSet.Set;

  bytes32 public constant PERMIT_TYPEHASH = keccak256('Permit(address spender,uint256 tokenId,uint256 nonce,uint256 deadline)');
  bytes32 public constant PERMISSION_PERMIT_TYPEHASH =
    keccak256(
      'PermissionPermit(PermissionSet[] permissions,uint256 tokenId,uint256 nonce,uint256 deadline)PermissionSet(address operator,uint8[] permissions)'
    );
  bytes32 public constant PERMISSION_SET_TYPEHASH = keccak256('PermissionSet(address operator,uint8[] permissions)');
  IDCATokenDescriptor public nftDescriptor;
  address public hub;
  mapping(address => uint256) public nonces;
  mapping(uint256 => TokenInfo) internal _tokens;

  constructor(address _governor, IDCATokenDescriptor _descriptor)
    ERC721('Mean Finance DCA', 'DCA')
    EIP712('Mean Finance DCA', '1')
    Governable(_governor)
  {
    if (address(_descriptor) == address(0)) revert ZeroAddress();
    nftDescriptor = _descriptor;
  }

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
    if (msg.sender != hub) revert OnlyHubCanExecute();
    _mint(_owner, _id);
    _setPermissions(_id, _permissions);
  }

  function hasPermission(
    uint256 _id,
    address _address,
    Permission _permission
  ) external view returns (bool) {
    return ownerOf(_id) == _address || _tokens[_id].permissions[_address].hasPermission(_permission);
  }

  function burn(uint256 _id) external {
    if (msg.sender != hub) revert OnlyHubCanExecute();
    _burn(_id);
  }

  function modify(uint256 _id, PermissionSet[] calldata _permissions) external {
    if (msg.sender != ownerOf(_id)) revert NotOwner();
    _modify(_id, _permissions);
  }

  // solhint-disable-next-line func-name-mixedcase
  function DOMAIN_SEPARATOR() external view returns (bytes32) {
    return _domainSeparatorV4();
  }

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

  function setNFTDescriptor(IDCATokenDescriptor _descriptor) external onlyGovernor {
    if (address(_descriptor) == address(0)) revert ZeroAddress();
    nftDescriptor = _descriptor;
    emit NFTDescriptorSet(_descriptor);
  }

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
    for (uint256 i; i < _permissions.length; i++) {
      if (_permissions[i].permissions.length == 0) {
        _tokens[_id].operators.remove(_permissions[i].operator);
        delete _tokens[_id].permissions[_permissions[i].operator];
      } else {
        _tokens[_id].operators.add(_permissions[i].operator);
        _tokens[_id].permissions[_permissions[i].operator] = _permissions[i].permissions.toUInt8();
      }
    }
  }

  function _beforeTokenTransfer(
    address,
    address,
    uint256 _id
  ) internal override {
    TokenInfo storage _info = _tokens[_id];
    while (_info.operators.length() > 0) {
      address _operator = _info.operators.at(0);
      delete _info.permissions[_operator];
      _info.operators.remove(_operator);
    }
  }
}
