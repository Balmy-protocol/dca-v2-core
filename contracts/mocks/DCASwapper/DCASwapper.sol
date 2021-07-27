// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.4;

import '../../DCASwapper/DCASwapper.sol';

contract DCASwapperMock is DCASwapper {
  mapping(address => uint24) internal _pairsToSwap;
  bool private _pairsToSwapSet = false;

  constructor(
    address _governor,
    ISwapRouter _router,
    ICustomQuoter _quoter
  ) DCASwapper(_governor, _router, _quoter) {}

  function bestFeeTierForSwap(IDCAPair _pair) public override returns (uint24 _feeTier) {
    if (_pairsToSwapSet) {
      _feeTier = _pairsToSwap[address(_pair)];
    } else {
      _feeTier = super.bestFeeTierForSwap(_pair);
    }
  }

  function setPairsToSwap(address[] calldata _pairs, uint24[] calldata _feeTiers) external {
    _pairsToSwapSet = true;
    for (uint256 i; i < _pairs.length; i++) {
      _pairsToSwap[_pairs[i]] = _feeTiers[i];
    }
  }
}
