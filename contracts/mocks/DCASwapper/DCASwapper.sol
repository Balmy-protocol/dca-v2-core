// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.4;

import '@openzeppelin/contracts/utils/structs/EnumerableSet.sol';
import '../../DCASwapper/DCASwapper.sol';

contract DCASwapperMock is DCASwapper {
  using EnumerableSet for EnumerableSet.AddressSet;

  mapping(address => uint24) internal _pairsToSwap;
  bool private _pairsToSwapSet = false;

  constructor(
    address _governor,
    IDCAFactory _factory,
    ISwapRouter _router,
    ICustomQuoter _quoter
  ) DCASwapper(_governor, _factory, _router, _quoter) {}

  function bestFeeTierForSwap(IDCAPair _pair) external returns (uint24 _feeTier) {
    _feeTier = _bestFeeTierForSwap(_pair);
  }

  function _bestFeeTierForSwap(IDCAPair _pair) internal override returns (uint24 _feeTier) {
    if (_pairsToSwapSet) {
      _feeTier = _pairsToSwap[address(_pair)];
    } else {
      _feeTier = super._bestFeeTierForSwap(_pair);
    }
  }

  function setPairsToSwap(address[] calldata _pairs, uint24[] calldata _feeTiers) external {
    _pairsToSwapSet = true;
    for (uint256 i; i < _pairs.length; i++) {
      _pairsToSwap[_pairs[i]] = _feeTiers[i];
    }
  }
}
