// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.8.4;

import './IDCAGlobalParameters.sol';

interface IDCAFactoryPairsHandler {
  event PairCreated(address indexed _token0, address indexed _token1, address _pair);

  function globalParameters() external view returns (IDCAGlobalParameters);

  function pairByTokens(address _tokenA, address _tokenB) external view returns (address _pair);

  function allPairs(uint256 _pairIndex) external view returns (address pair);

  function createPair(address _tokenA, address _tokenB) external returns (address pair);
}

interface IDCAFactory is IDCAFactoryPairsHandler {}
