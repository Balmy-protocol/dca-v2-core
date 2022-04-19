// SPDX-License-Identifier: BUSL-1.1
pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '../interfaces/IDCAHub.sol';
import '../libraries/TokenSorting.sol';

abstract contract DCAHubParameters is IDCAHubParameters {
  using SafeERC20 for IERC20Metadata;

  /// @inheritdoc IDCAHubParameters
  mapping(address => mapping(address => bytes1)) public activeSwapIntervals; // token A => token B => active swap intervals
  mapping(address => uint256) public magnitude;
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

  function _transfer(
    address _token,
    address _to,
    uint256 _amount
  ) internal {
    IERC20Metadata(_token).safeTransfer(_to, _amount);
  }

  function _balanceOf(address _token) internal view returns (uint256) {
    return IERC20Metadata(_token).balanceOf(address(this));
  }
}
