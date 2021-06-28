//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

import 'hardhat/console.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '../../interfaces/IERC20Detailed.sol';

interface IMAParameters {
  struct Liquidity {
    uint256 tokenA;
    uint256 tokenB;
  }

  struct PairData {
    address tokenA;
    address tokenB;
  }

  function liquidity(address _pair) external view returns (uint256 _tokenA, uint256 _tokenB);
}

abstract contract MAPParameters is IMAParameters {
  // Tracking
  mapping(address => Liquidity) public override liquidity;
  mapping(address => PairData) internal _pairs;

  function _getPairData(address _pair) internal view returns (PairData memory _pairData) {
    PairData memory _cachedData = _pairs[_pair];

    if (_cachedData.tokenA == address(0)) {
      // TODO: If not cached, then fetch info and cache it

      revert('MAP: Seems like the given pair does not exist');
    }

    _pairData = _pairs[_pair];
  }
}
