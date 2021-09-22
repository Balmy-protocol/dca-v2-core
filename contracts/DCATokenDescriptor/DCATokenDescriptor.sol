// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';
import '../interfaces/IDCATokenDescriptor.sol';
import '../DCAHub/DCAHub.sol';
import '../libraries/NFTDescriptor.sol';

/// @title Describes NFT token positions
/// @notice Produces a string containing the data URI for a JSON metadata string
contract DCATokenDescriptor is IDCATokenDescriptor {
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
          swapInterval: 'Daily', // TODO: Fetch form the hub, or calculate here, but avoid hardcoding
          swapsExecuted: _userPosition.swapsExecuted,
          swapped: _userPosition.swapped,
          swapsLeft: _userPosition.swapsLeft,
          remaining: _userPosition.remaining,
          rate: _userPosition.rate
        })
      );
  }
}
