// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

import './IDCAGlobalParameters.sol';

interface IDCAFactoryPairsHandler {
  event PairCreated(address indexed _token0, address indexed _token1, uint32 _swapInterval, address _pair);

  function globalParameters() external view returns (IDCAGlobalParameters);

  function pairByTokensAndSwapInterval(
    address _tokenA,
    address _tokenB,
    uint32 _swapInterval
  ) external view returns (address _pair);

  function getPairByTokensAndSwapInterval(
    address _tokenA,
    address _tokenB,
    uint32 _swapInterval
  ) external view returns (address _pair);

  function getPairsByTokens(address _tokenA, address _tokenB) external view returns (address[] memory _pairs);

  function pairsByTokens(
    address _tokenA,
    address _tokenB,
    uint256 _index
  ) external view returns (address _pair);

  function allPairs(uint256 _pairIndex) external view returns (address pair);

  function createPair(
    address _tokenA,
    address _tokenB,
    uint32 _swapInterval
  ) external returns (address pair);
}

interface IDCAFactory is IDCAFactoryPairsHandler {}
