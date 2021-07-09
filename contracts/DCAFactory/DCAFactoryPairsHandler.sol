// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.4;

import '@openzeppelin/contracts/utils/structs/EnumerableSet.sol';
import '../DCAPair/DCAPair.sol';
import '../interfaces/IERC20Detailed.sol';
import '../interfaces/IDCAFactory.sol';
import '../interfaces/IDCAGlobalParameters.sol';
import '../libraries/CommonErrors.sol';

abstract contract DCAFactoryPairsHandler is IDCAFactoryPairsHandler {
  using EnumerableSet for EnumerableSet.AddressSet;

  mapping(address => mapping(address => address)) internal _pairByTokens; // tokenA => tokenB => pair
  EnumerableSet.AddressSet internal _allPairs;
  IDCAGlobalParameters public override globalParameters;

  constructor(IDCAGlobalParameters _globalParameters) {
    if (address(_globalParameters) == address(0)) revert CommonErrors.ZeroAddress();
    globalParameters = _globalParameters;
  }

  function _sortTokens(address _tokenA, address _tokenB) internal pure returns (address __tokenA, address __tokenB) {
    (__tokenA, __tokenB) = _tokenA < _tokenB ? (_tokenA, _tokenB) : (_tokenB, _tokenA);
  }

  function allPairs() external view override returns (address[] memory _pairs) {
    uint256 _length = _allPairs.length();
    _pairs = new address[](_length);
    for (uint256 i; i < _length; i++) {
      _pairs[i] = _allPairs.at(i);
    }
  }

  function isPair(address _address) external view override returns (bool _isPair) {
    _isPair = _allPairs.contains(_address);
  }

  function pairByTokens(address _tokenA, address _tokenB) external view override returns (address _pair) {
    (address __tokenA, address __tokenB) = _sortTokens(_tokenA, _tokenB);
    _pair = _pairByTokens[__tokenA][__tokenB];
  }

  function createPair(address _tokenA, address _tokenB) public override returns (address _pair) {
    if (_tokenA == address(0) || _tokenB == address(0)) revert CommonErrors.ZeroAddress();
    if (_tokenA == _tokenB) revert IdenticalTokens();
    (address __tokenA, address __tokenB) = _sortTokens(_tokenA, _tokenB);
    if (_pairByTokens[__tokenA][__tokenB] != address(0)) revert PairAlreadyExists();
    _pair = address(new DCAPair(globalParameters, IERC20Detailed(__tokenA), IERC20Detailed(__tokenB)));
    _pairByTokens[__tokenA][__tokenB] = _pair;
    _allPairs.add(_pair);
    emit PairCreated(__tokenA, __tokenB, _pair);
  }
}
