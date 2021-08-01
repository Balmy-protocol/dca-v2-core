// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

import '@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol';

/// @title The interface for an oracle that provies TWAP quotes
/// @notice These methods allow users to add support for pairs, and then ask for quotes
interface ITimeWeightedOracle {
  /// @notice Emitted when the oracle add supports for a new pair
  /// @param _tokenA One of the pair's tokens
  /// @param _tokenB The other of the pair's tokens
  event AddedSupportForPair(address _tokenA, address _tokenB);

  /// @notice Returns whether this oracle can support this pair of tokens
  /// @dev _tokenA and _tokenB may be passed in either tokenA/tokenB or tokenB/tokenA order
  /// @param _tokenA One of the pair's tokens
  /// @param _tokenB The other of the pair's tokens
  /// @return _canSupport Whether the given pair of tokens can be supported by the oracle
  function canSupportPair(address _tokenA, address _tokenB) external view returns (bool _canSupport);

  /// @notice Returns a quote, based on the given tokens and amount
  /// @param _tokenIn The token that will be provided
  /// @param _amountIn The amount that will be provided
  /// @param _tokenOut The token we would like to quote
  /// @return _amountOut How much _tokenOut will be returned in exchange for _amountIn amount of _tokenIn
  function quote(
    address _tokenIn,
    uint128 _amountIn,
    address _tokenOut
  ) external view returns (uint256 _amountOut);

  /// @notice Add support for a given pair to the contract. This function will let the oracle take some actions to
  /// configure the pair for future quotes. Could be called more than one in order to let the oracle re-configure for a new context.
  /// @dev Will revert if pair cannot be supported. _tokenA and _tokenB may be passed in either tokenA/tokenB or tokenB/tokenA order
  /// @param _tokenA One of the pair's tokens
  /// @param _tokenB The other of the pair's tokens
  function addSupportForPair(address _tokenA, address _tokenB) external;
}

/// @title An implementation of ITimeWeightedOracle that uses Uniswap V3 pool oracles
/// @notice This oracle will attempt to use all fee tiers of the same pair when calculating quotes
interface IUniswapV3OracleAggregator is ITimeWeightedOracle {
  /// @notice Emitted when a new fee tier is added
  /// @return _feeTier The added fee tier
  event AddedFeeTier(uint24 _feeTier);

  /// @notice Emitted when a new period is set
  /// @return _period The new period
  event PeriodChanged(uint32 _period);

  /// @notice Returns the Uniswap V3 Factory
  /// @return _factory The Uniswap V3 Factory
  function factory() external view returns (IUniswapV3Factory _factory);

  /// @notice Returns a list of all supported Uniswap V3 fee tiers
  /// @return _feeTiers An array of all supported fee tiers
  function supportedFeeTiers() external view returns (uint24[] memory _feeTiers);

  /// @notice Returns a list of all Uniswap V3 pools used for a given pair
  /// @dev _tokenA and _tokenB may be passed in either tokenA/tokenB or tokenB/tokenA order
  /// @return _pools An array with all pools used for quoting the given pair
  function poolsUsedForPair(address _tokenA, address _tokenB) external view returns (address[] memory _pools);

  /// @notice Returns the period used for the TWAP calculation
  /// @return _period The period used for the TWAP
  function period() external view returns (uint16 _period);

  /// @notice Returns minimum possible period
  /// @dev Cannot be modified
  /// @return The minimum possible period
  // solhint-disable-next-line func-name-mixedcase
  function MINIMUM_PERIOD() external view returns (uint16);

  /// @notice Returns maximum possible period
  /// @dev Cannot be modified
  /// @return The maximum possible period
  // solhint-disable-next-line func-name-mixedcase
  function MAXIMUM_PERIOD() external view returns (uint16);

  /// @notice Returns the minimum liquidity that a pool needs to have in order to be used for a pair's quote
  /// @dev This check is only performed when adding support for a pair. If the pool's liquidity then
  /// goes below the threshold, then it will still be used for the quote calculation
  /// @return The minimum liquidity threshold
  // solhint-disable-next-line func-name-mixedcase
  function MINIMUM_LIQUIDITY_THRESHOLD() external view returns (uint16);

  /// @notice Adds support for a new Uniswap V3 fee tier
  /// @dev Will revert if the provided fee tier is not supported by Uniswap V3
  /// @param _feeTier The new fee tier
  function addFeeTier(uint24 _feeTier) external;

  /// @notice Sets the period to be used for the TWAP calculation
  /// @dev Will revert it is lower than MINIMUM_PERIOD or greater than MAXIMUM_PERIOD
  /// WARNING: increasing the period could cause big problems, because Uniswap V3 pools might not support a TWAP so old.
  /// @param _period The new period
  function setPeriod(uint16 _period) external;
}
