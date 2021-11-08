// SPDX-License-Identifier: BUSL-1.1
pragma solidity >=0.8.7 <0.9.0;

import '../interfaces/IDCAHub.sol';
import '../libraries/TokenSorting.sol';

abstract contract DCAHubParameters is IDCAHubParameters {
  /// @inheritdoc IDCAHubParameters
  mapping(address => mapping(address => bytes1)) public activeSwapIntervals; // token A => token B => active swap intervals
  /// @inheritdoc IDCAHubParameters
  mapping(address => uint256) public platformBalance; // token => balance
  mapping(address => mapping(address => mapping(bytes1 => mapping(uint32 => SwapDelta)))) internal _swapAmountDelta; // token A => token B => swap interval => swap number => delta
  mapping(address => mapping(address => mapping(bytes1 => mapping(uint32 => AccumRatio)))) internal _accumRatio; // token A => token B => swap interval => swap number => accum
  mapping(address => mapping(address => mapping(bytes1 => SwapData))) internal _swapData; // token A => token B => swap interval => swap data

  /// @inheritdoc IDCAHubParameters
  function swapAmountDelta(
    address _tokenA,
    address _tokenB,
    bytes1 _swapIntervalMask,
    uint32 _swapNumber
  ) external view returns (SwapDelta memory) {
    (address __tokenA, address __tokenB) = TokenSorting.sortTokens(_tokenA, _tokenB);
    return _swapAmountDelta[__tokenA][__tokenB][_swapIntervalMask][_swapNumber];
  }

  /// @inheritdoc IDCAHubParameters
  function accumRatio(
    address _tokenA,
    address _tokenB,
    bytes1 _swapIntervalMask,
    uint32 _swapNumber
  ) external view returns (AccumRatio memory) {
    (address __tokenA, address __tokenB) = TokenSorting.sortTokens(_tokenA, _tokenB);
    return _accumRatio[__tokenA][__tokenB][_swapIntervalMask][_swapNumber];
  }

  /// @inheritdoc IDCAHubParameters
  function swapData(
    address _tokenA,
    address _tokenB,
    bytes1 _swapIntervalMask
  ) external view returns (SwapData memory) {
    (address __tokenA, address __tokenB) = TokenSorting.sortTokens(_tokenA, _tokenB);
    return _swapData[__tokenA][__tokenB][_swapIntervalMask];
  }

  function _assertNonZeroAddress(address _address) internal pure {
    if (_address == address(0)) revert IDCAHub.ZeroAddress();
  }

  function _calculateMagnitude(address _token) internal view returns (uint120) {
    return uint120(10**IERC20Metadata(_token).decimals());
  }
}
