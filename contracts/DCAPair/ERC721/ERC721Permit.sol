// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

import '@openzeppelin/contracts/utils/cryptography/ECDSA.sol';
import '@openzeppelin/contracts/utils/Counters.sol';
import '../../interfaces/ERC721/IERC721Permit.sol';
import './ERC721.sol';
import '@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol';

abstract contract ERC721Permit is ERC721, IERC721Permit, EIP712 {
  using Counters for Counters.Counter;

  mapping(address => Counters.Counter) private _nonces;

  // solhint-disable-next-line var-name-mixedcase
  bytes32 private immutable _PERMIT_TYPEHASH = keccak256('Permit(address signer,address to,uint256 tokenId,uint256 nonce,uint256 deadline)');
  // solhint-disable-next-line var-name-mixedcase
  bytes32 private immutable _PERMIT_FOR_ALL_TYPEHASH =
    keccak256('PermitForAll(address owner,address operator,bool approved,uint256 nonce,uint256 deadline)');

  /**
   * @dev Initializes the {EIP712} domain separator using the `name` parameter, and setting `version` to `'1'`.
   *
   * It's a good idea to use the same `name` that is defined as the ERC721 token name.
   */
  constructor(string memory name) EIP712(name, '1') {}

  function permit(
    address signer,
    address to,
    uint256 tokenId,
    uint256 deadline,
    uint8 v,
    bytes32 r,
    bytes32 s
  ) public virtual override {
    // solhint-disable-next-line not-rely-on-time
    require(block.timestamp <= deadline, 'ERC721Permit: expired deadline');

    bytes32 structHash = keccak256(abi.encode(_PERMIT_TYPEHASH, signer, to, tokenId, _useNonce(signer), deadline));

    bytes32 hash = _hashTypedDataV4(structHash);

    address owner = ownerOf(tokenId);
    address _actualSigner = ECDSA.recover(hash, v, r, s);
    require(_actualSigner == signer, 'ERC721Permit: invalid signature');
    require(signer == owner || ERC721.isApprovedForAll(owner, signer), 'ERC721Permit: signer is not owner nor approved for all');

    _approve(to, tokenId);
  }

  function permitForAll(
    address owner,
    address operator,
    bool approved,
    uint256 deadline,
    uint8 v,
    bytes32 r,
    bytes32 s
  ) public virtual override {
    // solhint-disable-next-line not-rely-on-time
    require(block.timestamp <= deadline, 'ERC721Permit: expired deadline');
    require(operator != address(0), 'ERC721Permit: operator cannot be the zero address');
    require(operator != owner, 'ERC721Permit: operator cannot be same as owner');

    bytes32 structHash = keccak256(abi.encode(_PERMIT_FOR_ALL_TYPEHASH, owner, operator, approved, _useNonce(owner), deadline));

    bytes32 hash = _hashTypedDataV4(structHash);

    address signer = ECDSA.recover(hash, v, r, s);
    require(signer == owner, 'ERC721Permit: invalid signature');

    _setApprovalForAll(owner, operator, approved);
    emit ApprovalForAll(owner, operator, approved);
  }

  function nonces(address owner) public view virtual override returns (uint256) {
    return _nonces[owner].current();
  }

  // solhint-disable-next-line func-name-mixedcase
  function DOMAIN_SEPARATOR() external view override returns (bytes32) {
    return _domainSeparatorV4();
  }

  /**
   * @dev 'Consume a nonce': return the current value and increment.
   */
  function _useNonce(address owner) internal virtual returns (uint256 current) {
    current = _nonces[owner].current();
    _nonces[owner].increment();
  }
}
