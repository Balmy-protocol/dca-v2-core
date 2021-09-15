// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.6;

import './DCAHubParameters.sol';
import './DCAHubPositionHandler.sol';
import './DCAHubSwapHandler.sol';
import './DCAHubLoanHandler.sol';
import './DCAHubConfigHandler.sol';

// TODO: Implement interface again
contract DCAHub is DCAHubParameters, DCAHubConfigHandler, DCAHubSwapHandler, DCAHubPositionHandler, DCAHubLoanHandler {
  constructor(
    IDCAGlobalParameters _globalParameters,
    IERC20Metadata _tokenA,
    IERC20Metadata _tokenB,
    address _immediateGovernor,
    address _timeLockedGovernor,
    IDCATokenDescriptor _nftDescriptor,
    ITimeWeightedOracle _oracle
  )
    DCAHubParameters(_globalParameters, _tokenA, _tokenB)
    DCAHubPositionHandler(_tokenA, _tokenB)
    DCAHubConfigHandler(_immediateGovernor, _timeLockedGovernor, _nftDescriptor, _oracle)
  {}

  // TODO: Remove when we remove ERC721
  function supportsInterface(bytes4 interfaceId) public view virtual override(ERC721, AccessControl) returns (bool) {
    return super.supportsInterface(interfaceId);
  }
}
