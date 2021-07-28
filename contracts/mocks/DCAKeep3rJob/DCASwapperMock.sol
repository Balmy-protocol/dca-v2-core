// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.4;

import '../../interfaces/IDCASwapper.sol';

contract DCASwapperMock {
  IDCASwapper.PairToSwap[] internal _lastCalled;
  mapping(address => uint24) internal _bestFeeTiers;

  function bestFeeTierForSwap(address _pair) public view returns (uint24 _feeTier) {
    _feeTier = _bestFeeTiers[address(_pair)];
  }

  function setPairsToSwap(address[] calldata _pairs, uint24[] calldata _feeTiers) external {
    for (uint256 i; i < _pairs.length; i++) {
      _bestFeeTiers[_pairs[i]] = _feeTiers[i];
    }
  }

  function swapPairs(IDCASwapper.PairToSwap[] calldata _pairsToSwap) external returns (uint256 _amountSwapped) {
    for (uint256 i; i < _pairsToSwap.length; i++) {
      _lastCalled.push(_pairsToSwap[i]);
    }
    _amountSwapped = 20;
  }

  function lastCalled() external view returns (IDCASwapper.PairToSwap[] memory __lastCalled) {
    __lastCalled = new IDCASwapper.PairToSwap[](_lastCalled.length);
    for (uint256 i; i < __lastCalled.length; i++) {
      __lastCalled[i] = _lastCalled[i];
    }
  }
}
