// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.6;

import './IDCAGlobalParameters.sol';

/// @title Factory of DCA pairs
/// @notice This is the contract you communicate with to create new pairs or query created ones
/// @dev This factory can return 4 errors for the creation of a pair.
/// PairAlreadyExists if the pair already exists.
/// IdenticalTokens if you send the same tokenA and tokenB.
/// ZeroAddress if tokenA or tokenB is the zero address.
/// PairNotSupported if the oracle does not support the pair.
interface IDCAFactoryPairsHandler {
  /// @notice Thrown when both tokens are equal
  error IdenticalTokens();
  /// @notice Thrown when trying to create a pair that already exists
  error PairAlreadyExists();

  /// @notice Emitted when a pair is created
  /// @param _tokenA The first token of the pair by address sort order
  /// @param _tokenB The second token of the pair by address sort order
  /// @param _pair The address of the created pair
  event PairCreated(address indexed _tokenA, address indexed _tokenB, address _pair);

  /// @notice Returns the global parameters contract
  /// @dev Global parameters has information about swaps and pairs, like swap intervals, fees charged, etc.
  /// @return The Global Parameters contract
  function globalParameters() external view returns (IDCAGlobalParameters);

  /// @notice Gets a pair by a set of tokens
  /// @dev _tokenA and _tokenB may be passed in either tokenA/tokenB or tokenB/tokenA order
  /// @param _tokenA first token of the pair
  /// @param _tokenB second token of the pair
  /// @return _pair Address of the pair if found, or zero address if it doesn't exist
  function pairByTokens(address _tokenA, address _tokenB) external view returns (address _pair);

  /// @notice Gets a list of all available pairs
  /// @dev Returns an array of addresses for each pair that is created
  /// @return _pairs Array of pair addresses
  function allPairs() external view returns (address[] memory _pairs);

  /// @notice Checks if address is a pair
  /// @param _address address to test if it is a pair address
  /// @return _isPair True if address is a pair, false if it is not
  function isPair(address _address) external view returns (bool _isPair);

  /// @notice Creates a pair for 2 tokens
  /// @dev _tokenA and _tokenB may be passed in either tokenA/tokenB or tokenB/tokenA order
  /// If the pair already exists, it raises the PairAlreadyExists error.
  /// If both parameters are equal, raises the IdenticalTokens error.
  /// If one of the parameters is the zero address, raises the ZeroAddress error.
  /// If the oracle does not support the pair, raises the PairNotSupported error.
  /// @param _tokenA first token of the pair
  /// @param _tokenB second token of the pair
  /// @return pair Address of the newly created pair
  function createPair(address _tokenA, address _tokenB) external returns (address pair);
}

interface IDCAFactory is IDCAFactoryPairsHandler {}
