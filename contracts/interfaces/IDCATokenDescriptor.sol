// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.6;

import './IDCAPair.sol';

/// @title The interface for generating a token's description
/// @notice Contracts that implement this interface must return a base64 JSON with the entire description
interface IDCATokenDescriptor {
  /// @notice Generates a token's description, both the JSON and the image inside
  /// @param _positionHandler The pair where the position was created
  /// @param _tokenId The token/position id
  /// @return _description The position's description
  function tokenURI(IDCAPairPositionHandler _positionHandler, uint256 _tokenId) external view returns (string memory _description);
}
