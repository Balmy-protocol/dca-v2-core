// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.4;

import '../DCAPair/DCAPair.sol';
import '../interfaces/IERC20Detailed.sol';
import '../interfaces/IDCAFactory.sol';
import '../interfaces/IDCAGlobalParameters.sol';
import '../libraries/CommonErrors.sol';

abstract contract DCAFactoryPairsHandler is IDCAFactoryPairsHandler {
  mapping(address => mapping(address => address)) internal _pairByTokens; // token0 => token1 => pair
  address[] public override allPairs;
  IDCAGlobalParameters public override globalParameters;

  constructor(IDCAGlobalParameters _globalParameters) {
    if (address(_globalParameters) == address(0)) revert CommonErrors.ZeroAddress();
    globalParameters = _globalParameters;
  }

  function _sortTokens(address _tokenA, address _tokenB) internal pure returns (address _token0, address _token1) {
    (_token0, _token1) = _tokenA < _tokenB ? (_tokenA, _tokenB) : (_tokenB, _tokenA);
  }

  function pairByTokens(address _tokenA, address _tokenB) external view override returns (address _pair) {
    (address _token0, address _token1) = _sortTokens(_tokenA, _tokenB);
    _pair = _pairByTokens[_token0][_token1];
  }

  function createPair(address _tokenA, address _tokenB) public override returns (address _pair) {
    if (_tokenA == address(0) || _tokenB == address(0)) revert CommonErrors.ZeroAddress();
    if (_tokenA == _tokenB) revert IdenticalTokens();
    (address _token0, address _token1) = _sortTokens(_tokenA, _tokenB);
    if (_pairByTokens[_token0][_token1] != address(0)) revert PairAlreadyExists();
    _pair = address(new DCAPair(globalParameters, ISlidingOracle(address(0xe)), IERC20Detailed(_token0), IERC20Detailed(_token1)));
    _pairByTokens[_token0][_token1] = _pair;
    allPairs.push(_pair);
    emit PairCreated(_token0, _token1, _pair);
  }
}
