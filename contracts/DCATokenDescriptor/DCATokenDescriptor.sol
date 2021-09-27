// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';
import '../interfaces/IDCATokenDescriptor.sol';
import '../DCAHub/DCAHub.sol';
import '../libraries/NFTDescriptor.sol';

/// @title Describes NFT token positions
/// @notice Produces a string containing the data URI for a JSON metadata string
contract DCATokenDescriptor is IDCATokenDescriptor {
  // TODO: Move to interface
  error InvalidInterval();

  function tokenURI(address _hub, uint256 _tokenId) external view override returns (string memory) {
    // TODO: Stop using hub, and use interface when available
    IDCAHubPositionHandler.UserPosition memory _userPosition = DCAHub(_hub).userPosition(_tokenId);

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

  function intervalToDescription(uint32 _swapInterval) public pure override returns (string memory) {
    if (_swapInterval == 5 minutes) return 'Every 5 minutes';
    if (_swapInterval == 15 minutes) return 'Every 15 minutes';
    if (_swapInterval == 30 minutes) return 'Every 30 minutes';
    if (_swapInterval == 1 hours) return 'Hourly';
    if (_swapInterval == 12 hours) return 'Every 12 hours';
    if (_swapInterval == 1 days) return 'Daily';
    if (_swapInterval == 1 weeks) return 'Weekly';
    if (_swapInterval == 30 days) return 'Monthy';
    revert InvalidInterval();
  }
}
