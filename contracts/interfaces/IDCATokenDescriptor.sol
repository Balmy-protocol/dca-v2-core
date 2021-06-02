// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

import './IDCAPair.sol';

interface IDCATokenDescriptor {
  function tokenURI(IDCAPair pair, uint256 tokenId) external view returns (string memory);
}
