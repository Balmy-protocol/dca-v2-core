// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.4;

contract DCASwapperMock {
  mapping(address => uint24) internal _pairsToSwap;

  function bestFeeTierForSwap(address _pair) public view returns (uint24 _feeTier) {
    _feeTier = _pairsToSwap[address(_pair)];
  }

  function setPairsToSwap(address[] calldata _pairs, uint24[] calldata _feeTiers) external {
    for (uint256 i; i < _pairs.length; i++) {
      _pairsToSwap[_pairs[i]] = _feeTiers[i];
    }
  }
}
