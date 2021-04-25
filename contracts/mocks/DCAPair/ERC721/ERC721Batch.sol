// SPDX-License-Identifier: MIT

pragma solidity 0.8.0;

import '../../../DCAPair/ERC721/ERC721Batch.sol';
import '../../../interfaces/ERC721/IERC721Batch.sol';

contract ERC721BatchMock is ERC721Batch {
  constructor(string memory name) ERC721(name, 'symbol') {
    /* */
  }

  function mint(address to, uint256 tokenId) external {
    _mint(to, tokenId);
  }
}
