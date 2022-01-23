// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

import '@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol';
import './IPriceOracle.sol';

/// @title An implementation of IPriceOracle that uses Uniswap V3 pool oracles
/// @notice This oracle will attempt to use all fee tiers of the same pair when calculating quotes
interface IUniswapV3Oracle is IPriceOracle {
  /// @notice Emitted when a new fee tier is added
  /// @return feeTier The added fee tier
  event AddedFeeTier(uint24 feeTier);

  /// @notice Emitted when a new period is set
  /// @return period The new period
  event PeriodChanged(uint32 period);

  /// @notice Emitted when a new cardinality per minute is set
  /// @return cardinalityPerMinute The new cardinality per minute
  event CardinalityPerMinuteChanged(uint8 cardinalityPerMinute);

  /// @notice Emitted when the oracle add supports for a new pair
  /// @param tokenA One of the pair's tokens
  /// @param tokenB The other of the pair's tokens
  event AddedSupportForPairInUniswapOracle(address tokenA, address tokenB);

  /// @notice Returns the Uniswap V3 Factory
  /// @dev Cannot be modified after deployment
  /// @return _factory The Uniswap V3 Factory
  function factory() external view returns (IUniswapV3Factory _factory);

  /// @notice Returns a list of all supported Uniswap V3 fee tiers
  /// @return _feeTiers An array of all supported fee tiers
  function supportedFeeTiers() external view returns (uint24[] memory _feeTiers);

  /// @notice Returns a list of all Uniswap V3 pools used for a given pair
  /// @dev _tokenA and _tokenB may be passed in either tokenA/tokenB or tokenB/tokenA order
  /// @return _pools An array with all pools used for quoting the given pair
  function poolsUsedForPair(address _tokenA, address _tokenB) external view returns (address[] memory _pools);

  /// @notice Returns the cardinality per minute used for adding support to pairs
  /// @return The cardinality per minute used for increase cardinality calculations
  function cardinalityPerMinute() external view returns (uint8);

  /// @notice Returns the period used for the TWAP calculation
  /// @return The period used for the TWAP
  function period() external view returns (uint16);

  /// @notice Returns minimum possible period
  /// @dev Cannot be modified after deployment
  /// @return The minimum possible period
  function minimumPeriod() external view returns (uint16);

  /// @notice Returns maximum possible period
  /// @dev Cannot be modified after deployment
  /// @return The maximum possible period
  function maximumPeriod() external view returns (uint16);

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
  /// @dev Will revert it is lower than minimumPeriod or greater than maximumPeriod
  /// WARNING: increasing the period could cause big problems, because Uniswap V3 pools might not support a TWAP so old.
  /// @param _period The new period
  function setPeriod(uint16 _period) external;

  /// @notice Sets the cardinality per minute to be used when increasing observation cardinality at the moment of adding support for pairs
  /// @dev Will revert it is lower than minimumCardinalityPerMinute or greater than maximumCardinalityPerMinute
  /// WARNING: increasing the cardinality per minute will make adding support to a pair significantly costly
  /// @param _cardinalityPerMinute The new period
  function setCardinalityPerMinute(uint8 _cardinalityPerMinute) external;
}
