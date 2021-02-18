//SPDX-License-Identifier: Unlicense
pragma solidity 0.7.0;

import 'hardhat/console.sol';

import '../interfaces/IERC20Decimals.sol';

import '../DCAPair/DCAPair.sol';

import './DCAFactoryParameters.sol';

interface IDCAFactoryPairsHandler is IDCAFactoryParameters {
  event PairCreated(address indexed token0, address indexed token1, uint256 _swapInterval, address pair);

  function pairByTokensAndSwapInterval(
    address _from,
    address _to,
    uint256 _swapInterval
  ) external view returns (address _pair);

  function getPairsByTokens(address _from, address _to) external view returns (address[] memory _pairs);

  function pairsByTokens(
    address _from,
    address _to,
    uint256 _index
  ) external view returns (address _pair);

  function allPairs(uint256 _pairIndex) external view returns (address pair);

  function createPair(
    address _from,
    address _to,
    uint256 _swapInterval
  ) external returns (address pair);
}

abstract contract DCAFactoryPairsHandler is DCAFactoryParameters, IDCAFactoryPairsHandler {
  mapping(address => mapping(address => mapping(uint256 => address))) public override pairByTokensAndSwapInterval;
  mapping(address => mapping(address => address[])) public override pairsByTokens;
  address[] public override allPairs;

  function getPairsByTokens(address _from, address _to) external view override returns (address[] memory) {
    return pairsByTokens[_from][_to];
  }

  function _createPair(
    address _from,
    address _to,
    uint256 _swapInterval
  ) internal returns (address _pair) {
    require(isSwapIntervalAllowed(_swapInterval), 'DCAFactory: interval-not-allowed');
    require(_from != _to, 'DCAFactory: identical-addresses');
    require(_to != address(0) && _to != address(0), 'DCAFactory: zero-address');
    require(pairByTokensAndSwapInterval[_from][_to][_swapInterval] == address(0), 'DCAFactory: pair-exists');
    _pair = address(new DCAPair(IERC20Decimals(_from), IERC20Decimals(_to), uniswap, _swapInterval));
    pairByTokensAndSwapInterval[_from][_to][_swapInterval] = _pair;
    pairsByTokens[_from][_to].push(_pair);
    allPairs.push(_pair);
    emit PairCreated(_from, _to, _swapInterval, _pair);
  }
}
