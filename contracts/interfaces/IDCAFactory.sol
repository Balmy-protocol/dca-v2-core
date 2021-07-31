// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.6;

import './IDCAGlobalParameters.sol';

interface IDCAFactoryPairsHandler {
  error IdenticalTokens();
  error PairAlreadyExists();

  event PairCreated(address indexed _tokenA, address indexed _tokenB, address _pair);

  function globalParameters() external view returns (IDCAGlobalParameters);

  function pairByTokens(address _tokenA, address _tokenB) external view returns (address _pair);

  function allPairs() external view returns (address[] memory _pairs);

  function isPair(address _address) external view returns (bool _isPair);

  function createPair(address _tokenA, address _tokenB) external returns (address pair);
}

interface IDCAFactory is IDCAFactoryPairsHandler {}
