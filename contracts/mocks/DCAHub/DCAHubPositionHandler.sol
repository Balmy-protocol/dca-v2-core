// SPDX-License-Identifier: UNLICENSED

pragma solidity >=0.8.7 <0.9.0;

import '../../DCAHub/DCAHubPositionHandler.sol';
import './DCAHubConfigHandler.sol';

contract DCAHubPositionHandlerMock is DCAHubPositionHandler, DCAHubConfigHandlerMock {
  constructor(
    IERC20Metadata _tokenA,
    IERC20Metadata _tokenB,
    address _immediateGovernor,
    address _timeLockedGovernor,
    ITimeWeightedOracle _oracle
  ) DCAHubConfigHandlerMock(_tokenA, _tokenB, _immediateGovernor, _timeLockedGovernor, _oracle) DCAHubPositionHandler(_tokenA, _tokenB) {}

  // PositionHandler
  function internalPosition(uint256 _dcaId) external view returns (DCA memory _dca) {
    _dca = _userPositions[_dcaId];
  }

  function setLastUpdated(uint256 _dcaId, uint32 _lastUpdated) external {
    _userPositions[_dcaId].swapWhereLastUpdated = _lastUpdated;
  }

  // TODO: Remove when we remove ERC721
  function supportsInterface(bytes4 interfaceId) public view virtual override(DCAHubPositionHandler, AccessControl) returns (bool) {
    return super.supportsInterface(interfaceId);
  }
}
