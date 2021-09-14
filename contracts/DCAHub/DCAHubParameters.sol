// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.6;

import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/utils/structs/EnumerableSet.sol';
import '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';

import '../interfaces/IDCAGlobalParameters.sol';
import '../interfaces/IDCAHub.sol';
import '../libraries/CommonErrors.sol';

import './utils/Math.sol';

abstract contract DCAHubParameters is IDCAHubParameters {
  using EnumerableSet for EnumerableSet.UintSet;

  // Internal constants
  uint24 public constant FEE_PRECISION = 10000;

  // Basic setup
  IDCAGlobalParameters public override globalParameters;
  IERC20Metadata public override tokenA;
  IERC20Metadata public override tokenB;

  // Tracking
  // TODO: See if there is a way to optimize all these mappings
  mapping(address => mapping(address => mapping(uint32 => mapping(uint32 => int256)))) public swapAmountDelta; // from token => to token => swap interval => swap number => delta
  mapping(address => mapping(address => mapping(uint32 => mapping(uint32 => uint256)))) public accumRatio; // from token => to token => swap interval => swap number => accum

  mapping(address => mapping(address => mapping(uint32 => uint32))) public performedSwaps; // token A => token B => swap interval => performed swaps
  mapping(address => mapping(address => mapping(uint32 => uint32))) public nextSwapAvailable; // token A => token B => swap interval => timestamp
  mapping(address => mapping(address => EnumerableSet.UintSet)) internal _activeSwapIntervals; // token A => token B => active swap intervals

  // TODO: Add a way to enumerate a way to list all tokens that might have balance
  mapping(address => uint256) public platformBalance; // token => balance
  mapping(address => uint256) internal _balances; // token => balance

  constructor(
    IDCAGlobalParameters _globalParameters,
    IERC20Metadata _tokenA,
    IERC20Metadata _tokenB
  ) {
    if (address(_globalParameters) == address(0) || address(_tokenA) == address(0) || address(_tokenB) == address(0))
      revert CommonErrors.ZeroAddress();
    globalParameters = _globalParameters;
    tokenA = _tokenA;
    tokenB = _tokenB;
  }

  function isSwapIntervalActive(
    address _tokenA,
    address _tokenB,
    uint32 _activeSwapInterval
  ) external view returns (bool _isIntervalActive) {
    _isIntervalActive = _tokenA < _tokenB
      ? _activeSwapIntervals[_tokenA][_tokenB].contains(_activeSwapInterval)
      : _activeSwapIntervals[_tokenB][_tokenA].contains(_activeSwapInterval);
  }

  function _getFeeFromAmount(uint32 _feeAmount, uint256 _amount) internal pure returns (uint256) {
    return (_amount * _feeAmount) / FEE_PRECISION / 100;
  }
}
