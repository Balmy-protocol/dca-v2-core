// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.6;

import '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';

contract UniswapFactoryMock {
  mapping(address => mapping(address => mapping(uint24 => bool))) private _supportedPairs;

  function supportPair(
    address _token0,
    address _token1,
    uint24 _feeTier
  ) external {
    (address _tokenA, address _tokenB) = _sortTokens(_token0, _token1);
    _supportedPairs[_tokenA][_tokenB][_feeTier] = true;
  }

  function getPool(
    address _token0,
    address _token1,
    uint24 _feeTier
  ) external view returns (address) {
    (address _tokenA, address _tokenB) = _sortTokens(_token0, _token1);
    if (_supportedPairs[_tokenA][_tokenB][_feeTier]) {
      return address(1);
    } else {
      return address(0);
    }
  }

  function _sortTokens(address _tokenA, address _tokenB) internal pure returns (address __tokenA, address __tokenB) {
    (__tokenA, __tokenB) = _tokenA < _tokenB ? (_tokenA, _tokenB) : (_tokenB, _tokenA);
  }
}
