// SPDX-License-Identifier: MIT

pragma solidity 0.7.0;

import '../../DCAPair/ERC721Batch.sol';
import '../../interfaces/IERC721Batch.sol';

contract ERC721BatchMock is ERC721Batch {
  constructor(string memory name, string memory symbol) ERC721(name, symbol) {
    /* */
  }

  function mint(address to, uint256 tokenId) external {
    _mint(to, tokenId);
  }
}
