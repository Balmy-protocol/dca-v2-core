//SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.4;

import '@openzeppelin/contracts/utils/structs/EnumerableSet.sol';
import '../../interfaces/IDCASubsidyPool.sol';

abstract contract MAPParameters is IMAParameters {
  using EnumerableSet for EnumerableSet.AddressSet;

  struct Liquidity {
    uint256 amountTokenA;
    uint256 amountTokenB;
  }

  // Tracking
  mapping(address => Liquidity) public override liquidity;
  EnumerableSet.AddressSet internal _pairsWithLiquidity;

  function activePairs() public view override returns (PairLiquidity[] memory _activePairs) {
    uint256 _length = _pairsWithLiquidity.length();
    _activePairs = new PairLiquidity[](_length);
    for (uint256 i; i < _length; i++) {
      address _pair = _pairsWithLiquidity.at(i);
      Liquidity memory _liquidity = liquidity[_pair];
      _activePairs[i] = PairLiquidity({pair: _pair, amountTokenA: _liquidity.amountTokenA, amountTokenB: _liquidity.amountTokenB});
    }
  }
}
