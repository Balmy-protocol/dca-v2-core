// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

import '@chainlink/contracts/src/v0.8/interfaces/FeedRegistryInterface.sol';
import './IPriceOracle.sol';

/// @title An implementation of IPriceOracle that uses Chainlink feeds
/// @notice This oracle will attempt to use all available feeds to determine prices between pairs
interface IChainlinkOracle is IPriceOracle {
  /// @notice The plan that will be used to calculate quotes for a given pair
  enum PricingPlan {
    // There is no plan calculated
    NONE,
    // Will use the ETH/USD feed
    ETH_USD_PAIR,
    // Will use a token/USD feed
    TOKEN_USD_PAIR,
    // Will use a token/ETH feed
    TOKEN_ETH_PAIR,
    // Will use tokenIn/USD and tokenOut/USD feeds
    TOKEN_TO_USD_TO_TOKEN_PAIR,
    // Will use tokenIn/ETH and tokenOut/ETH feeds
    TOKEN_TO_ETH_TO_TOKEN_PAIR,
    // Will use tokenA/USD, tokenB/ETH and ETH/USD feeds
    TOKEN_A_TO_USD_TO_ETH_TO_TOKEN_B,
    // Will use tokenA/ETH, tokenB/USD and ETH/USD feeds
    TOKEN_A_TO_ETH_TO_USD_TO_TOKEN_B
  }

  /// @notice Emitted when the oracle add supports for a new pair
  /// @param tokenA One of the pair's tokens
  /// @param tokenB The other of the pair's tokens
  event AddedSupportForPairInChainlinkOracle(address tokenA, address tokenB);

  /// @notice Emitted when new tokens are considered USD
  /// @param tokens The new tokens
  event TokensConsideredUSD(address[] tokens);

  /// @notice Emitted when new mappings are added
  /// @param tokens The tokens
  /// @param mappings Their new mappings
  event MappingsAdded(address[] tokens, address[] mappings);

  /// @notice Thrown when the price is non-positive
  error InvalidPrice();

  /// @notice Thrown when the last price update was too long ago
  error LastUpdateIsTooOld();

  /// @notice Returns the Chainlink feed registry
  /// @return The Chainlink registry
  function registry() external view returns (FeedRegistryInterface);

  /// @notice Returns the address of the WETH ERC-20 token
  /// @return The address of the token
  // solhint-disable-next-line func-name-mixedcase
  function WETH() external view returns (address);

  /// @notice Returns the pricing plan that will be used when quoting the given pair
  /// @dev It is expected that _tokenA < _tokenB
  /// @return The pricing plan that will be used
  function planForPair(address _tokenA, address _tokenB) external view returns (PricingPlan);

  /// @notice Returns the mapping of the given token, if it exists. If it doesn't, then the original token is returned
  /// @return If it exists, the mapping is returned. Otherwise, the original token is returned
  function mappedToken(address _token) external view returns (address);

  /// @notice Adds new tokens that should be considered USD stablecoins
  /// @param _addresses The addresses of the tokens
  function addUSDStablecoins(address[] calldata _addresses) external;

  /// @notice Adds new token mappings
  /// @param _addresses The addresses of the tokens
  /// @param _mappings The addresses of their mappings
  function addMappings(address[] calldata _addresses, address[] calldata _mappings) external;
}
