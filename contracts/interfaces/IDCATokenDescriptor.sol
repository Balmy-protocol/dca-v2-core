// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

/**
 * @title The interface for generating a token's description
 * @notice Contracts that implement this interface must return a base64 JSON with the entire description
 */
interface IDCATokenDescriptor {
  /// @notice Thrown when a user tries get the description of an unsupported interval
  error InvalidInterval();

  /**
   * @notice Generates a token's description, both the JSON and the image inside
   * @param hub The address of the DCA Hub
   * @param tokenId The token/position id
   * @return description The position's description
   */
  function tokenURI(address hub, uint256 tokenId) external view returns (string memory description);

  /**
   * @notice Returns a text description for the given swap interval. For example for 3600, returns 'Hourly'
   * @dev Will revert with InvalidInterval if the function receives a unsupported interval
   * @param swapInterval The swap interval
   * @return description The description
   */
  function intervalToDescription(uint32 swapInterval) external pure returns (string memory description);
}
