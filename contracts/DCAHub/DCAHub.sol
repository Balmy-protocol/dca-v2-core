// SPDX-License-Identifier: BUSL-1.1
pragma solidity >=0.8.7 <0.9.0;

import './DCAHubParameters.sol';
import './DCAHubPositionHandler.sol';
import './DCAHubSwapHandler.sol';
import './DCAHubLoanHandler.sol';
import './DCAHubConfigHandler.sol';

// TODO: Implement interface again
contract DCAHub is DCAHubParameters, DCAHubConfigHandler, DCAHubSwapHandler, DCAHubPositionHandler, DCAHubLoanHandler {
  constructor(
    IERC20Metadata _tokenA,
    IERC20Metadata _tokenB,
    address _immediateGovernor,
    address _timeLockedGovernor,
    IDCATokenDescriptor _nftDescriptor,
    ITimeWeightedOracle _oracle
  )
    DCAHubParameters(_tokenA, _tokenB)
    DCAHubPositionHandler(_tokenA, _tokenB)
    DCAHubConfigHandler(_immediateGovernor, _timeLockedGovernor, _nftDescriptor, _oracle)
  {}

  // TODO: Remove when we remove ERC721
  function supportsInterface(bytes4 interfaceId) public view virtual override(DCAHubPositionHandler, AccessControl) returns (bool) {
    return super.supportsInterface(interfaceId);
  }

  function tokenURI(uint256 tokenId) public view override returns (string memory) {
    return nftDescriptor.tokenURI(this, tokenId);
  }
}
