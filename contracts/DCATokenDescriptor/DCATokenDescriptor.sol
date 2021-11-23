// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '../interfaces/IDCATokenDescriptor.sol';
import '../interfaces/IDCAHub.sol';
import '../libraries/NFTDescriptor.sol';

/// @title Describes NFT token positions
/// @notice Produces a string containing the data URI for a JSON metadata string
contract DCATokenDescriptor is IDCATokenDescriptor {
  function tokenURI(address _hub, uint256 _tokenId) external view returns (string memory) {
    IDCAHub.UserPosition memory _userPosition = IDCAHub(_hub).userPosition(_tokenId);

    return
      NFTDescriptor.constructTokenURI(
        NFTDescriptor.ConstructTokenURIParams({
          tokenId: _tokenId,
          fromToken: address(_userPosition.from),
          toToken: address(_userPosition.to),
          fromDecimals: _userPosition.from.decimals(),
          toDecimals: _userPosition.to.decimals(),
          fromSymbol: _userPosition.from.symbol(),
          toSymbol: _userPosition.to.symbol(),
          swapInterval: intervalToDescription(_userPosition.swapInterval),
          swapsExecuted: _userPosition.swapsExecuted,
          swapped: _userPosition.swapped,
          swapsLeft: _userPosition.swapsLeft,
          remaining: _userPosition.remaining,
          rate: _userPosition.rate
        })
      );
  }

  function intervalToDescription(uint32 _swapInterval) public pure returns (string memory) {
    if (_swapInterval == 1 minutes) return 'Every minute';
    if (_swapInterval == 5 minutes) return 'Every 5 minutes';
    if (_swapInterval == 15 minutes) return 'Every 15 minutes';
    if (_swapInterval == 30 minutes) return 'Every 30 minutes';
    if (_swapInterval == 1 hours) return 'Hourly';
    if (_swapInterval == 4 hours) return 'Every 4 hours';
    if (_swapInterval == 1 days) return 'Daily';
    if (_swapInterval == 1 weeks) return 'Weekly';
    revert InvalidInterval();
  }
}
