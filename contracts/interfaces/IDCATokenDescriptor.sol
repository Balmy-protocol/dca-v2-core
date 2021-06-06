// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.8.4;

import './IDCAPair.sol';

interface IDCATokenDescriptor {
  function tokenURI(IDCAPair pair, uint256 tokenId) external view returns (string memory);
}
