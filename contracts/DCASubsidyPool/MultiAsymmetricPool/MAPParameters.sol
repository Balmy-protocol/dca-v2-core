//SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.4;

import '@openzeppelin/contracts/utils/structs/EnumerableSet.sol';
import '../../interfaces/IDCASubsidyPool.sol';

abstract contract MAPParameters is IMAParameters {
  struct Liquidity {
    uint256 amountTokenA;
    uint256 amountTokenB;
  }

  using EnumerableSet for EnumerableSet.AddressSet;

  // Tracking
  mapping(address => Liquidity) public override liquidity;
  EnumerableSet.AddressSet internal _pairsWithLiquidity;

  function activePairs() public view override returns (address[] memory _activePairs) {
    uint256 _length = _pairsWithLiquidity.length();
    _activePairs = new address[](_length);
    for (uint256 i; i < _length; i++) {
      _activePairs[i] = _pairsWithLiquidity.at(i);
    }
  }
}
