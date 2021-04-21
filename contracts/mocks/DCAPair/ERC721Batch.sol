// SPDX-License-Identifier: MIT

pragma solidity 0.7.0;

import '../../DCAPair/ERC721Permit.sol';
import '../../interfaces/IERC721Permit.sol';

contract ERC721PermitMock is ERC721Permit {
  constructor(string memory name) ERC721Permit(name) ERC721(name, 'symbol') {
    /* */
  }

  function mint(address to, uint256 tokenId) external {
    _mint(to, tokenId);
  }
}
