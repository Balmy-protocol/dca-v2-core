// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.4;

import '@openzeppelin/contracts/utils/structs/EnumerableSet.sol';
import '../../DCASwapper/DCASwapper.sol';

contract DCASwapperMock is DCASwapper {
  using EnumerableSet for EnumerableSet.AddressSet;

  EnumerableSet.AddressSet internal _pairsToSwap;
  bool private _pairsToSwapSet = false;

  constructor(
    address _governor,
    IDCAFactory _factory,
    ISwapRouter _router,
    IQuoter _quoter
  ) DCASwapper(_governor, _factory, _router, _quoter) {}

  function shouldSwapPair(IDCAPair _pair) external returns (bool _shouldSwap) {
    _shouldSwap = _shouldSwapPair(_pair);
  }

  function _shouldSwapPair(IDCAPair _pair) internal override returns (bool _shouldSwap) {
    if (_pairsToSwapSet) {
      _shouldSwap = _pairsToSwap.contains(address(_pair));
    } else {
      _shouldSwap = super._shouldSwapPair(_pair);
    }
  }

  function setPairsToSwap(address[] memory _pairs) external {
    _pairsToSwapSet = true;
    for (uint256 i; i < _pairs.length; i++) {
      _pairsToSwap.add(_pairs[i]);
    }
  }
}
