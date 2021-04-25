// SPDX-License-Identifier: MIT

pragma solidity 0.8.0;

import '../../../DCAPair/ERC721/ERC721Permit.sol';
import '../../../interfaces/ERC721/IERC721Permit.sol';

contract ERC721PermitMock is ERC721Permit {
  constructor(string memory name) ERC721Permit(name) ERC721(name, 'symbol') {
    /* */
  }

  function mint(address to, uint256 tokenId) external {
    _mint(to, tokenId);
  }
}
