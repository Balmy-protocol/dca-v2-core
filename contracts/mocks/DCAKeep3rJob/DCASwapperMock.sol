// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.4;

import '../../interfaces/IDCASwapper.sol';

contract DCASwapperMock {
  IDCASwapper.PairToSwap[] internal _lastCalled;
  mapping(address => bytes) internal _paths;

  function findBestSwap(address _pair) public view returns (bytes memory _path) {
    _path = _paths[address(_pair)];
  }

  function setPairsToSwap(address[] calldata _pairs, bytes[] calldata __paths) external {
    for (uint256 i; i < _pairs.length; i++) {
      _paths[_pairs[i]] = __paths[i];
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
