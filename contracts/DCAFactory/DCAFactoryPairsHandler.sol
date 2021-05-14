// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

import 'hardhat/console.sol';

import '../interfaces/IERC20Detailed.sol';

import '../DCAPair/DCAPair.sol';

import './DCAFactoryParameters.sol';

interface IDCAFactoryPairsHandler is IDCAFactoryParameters {
  event PairCreated(address indexed _token0, address indexed _token1, uint256 _swapInterval, address _pair);

  function pairByTokensAndSwapInterval(
    address _tokenA,
    address _tokenB,
    uint256 _swapInterval
  ) external view returns (address _pair);

  function getPairByTokensAndSwapInterval(
    address _tokenA,
    address _tokenB,
    uint256 _swapInterval
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
    uint256 _swapInterval
  ) external returns (address pair);
}

abstract contract DCAFactoryPairsHandler is DCAFactoryParameters, IDCAFactoryPairsHandler {
  mapping(address => mapping(address => mapping(uint256 => address))) public override pairByTokensAndSwapInterval;
  mapping(address => mapping(address => address[])) public override pairsByTokens;
  address[] public override allPairs;

  function _sortTokens(address _tokenA, address _tokenB) internal pure returns (address _token0, address _token1) {
    (_token0, _token1) = _tokenA < _tokenB ? (_tokenA, _tokenB) : (_tokenB, _tokenA);
  }

  function getPairByTokensAndSwapInterval(
    address _tokenA,
    address _tokenB,
    uint256 _swapInterval
  ) external view override returns (address _pair) {
    (address _token0, address _token1) = _sortTokens(_tokenA, _tokenB);
    _pair = pairByTokensAndSwapInterval[_token0][_token1][_swapInterval];
  }

  function getPairsByTokens(address _tokenA, address _tokenB) external view override returns (address[] memory) {
    (address _token0, address _token1) = _sortTokens(_tokenA, _tokenB);
    return pairsByTokens[_token0][_token1];
  }

  function _createPair(
    address _tokenA,
    address _tokenB,
    uint256 _swapInterval
  ) internal returns (address _pair) {
    require(isSwapIntervalAllowed(_swapInterval), 'DCAFactory: interval not allowed');
    require(_tokenA != address(0) && _tokenB != address(0), 'DCAFactory: zero address');
    require(_tokenA != _tokenB, 'DCAFactory: identical addresses');
    (address _token0, address _token1) = _sortTokens(_tokenA, _tokenB);
    require(pairByTokensAndSwapInterval[_token0][_token1][_swapInterval] == address(0), 'DCAFactory: pair exists');
    _pair = address(new DCAPair(IERC20Detailed(_token0), IERC20Detailed(_token1), _swapInterval));
    pairByTokensAndSwapInterval[_token0][_token1][_swapInterval] = _pair;
    pairsByTokens[_token0][_token1].push(_pair);
    allPairs.push(_pair);
    emit PairCreated(_token0, _token1, _swapInterval, _pair);
  }
}
