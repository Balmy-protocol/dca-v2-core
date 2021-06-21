// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.8.4;
pragma abicoder v2;

import '../interfaces/IDCAGlobalParameters.sol';
import '../interfaces/IDCAPair.sol';
import '../interfaces/IERC20Detailed.sol';
import '../libraries/NFTDescriptor.sol';

/// @title Describes NFT token positions
/// @notice Produces a string containing the data URI for a JSON metadata string
contract DCATokenDescriptor is IDCATokenDescriptor {
  function tokenURI(IDCAPairPositionHandler _positionHandler, uint256 _tokenId) external view override returns (string memory) {
    IERC20Detailed _tokenA = _positionHandler.tokenA();
    IERC20Detailed _tokenB = _positionHandler.tokenB();
    IDCAGlobalParameters _globalParameters = _positionHandler.globalParameters();
    IDCAPairPositionHandler.UserPosition memory _userPosition = _positionHandler.userPosition(_tokenId);

    return
      NFTDescriptor.constructTokenURI(
        NFTDescriptor.ConstructTokenURIParams({
          tokenId: _tokenId,
          pair: address(_positionHandler),
          tokenA: address(_tokenA),
          tokenB: address(_tokenB),
          tokenADecimals: _tokenA.decimals(),
          tokenBDecimals: _tokenB.decimals(),
          tokenASymbol: _tokenA.symbol(),
          tokenBSymbol: _tokenB.symbol(),
          swapInterval: _globalParameters.intervalDescription(_userPosition.swapInterval),
          swapsExecuted: _userPosition.swapsExecuted,
          swapped: _userPosition.swapped,
          swapsLeft: _userPosition.swapsLeft,
          remaining: _userPosition.remaining,
          rate: _userPosition.rate,
          fromA: _userPosition.from == _tokenA
        })
      );
  }
}
