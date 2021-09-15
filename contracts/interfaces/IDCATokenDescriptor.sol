// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.6;

import '../DCAHub/DCAHub.sol';

/// @title The interface for generating a token's description
/// @notice Contracts that implement this interface must return a base64 JSON with the entire description
interface IDCATokenDescriptor {
  // TODO: Update comments, and stop using DCAHub directly

  /// @notice Generates a token's description, both the JSON and the image inside
  /// @param _hub The pair where the position was created
  /// @param _tokenId The token/position id
  /// @return _description The position's description
  function tokenURI(DCAHub _hub, uint256 _tokenId) external view returns (string memory _description);
}
