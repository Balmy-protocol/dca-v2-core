// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

import './IPriceOracle.sol';

/// @title An implementation of IPriceOracle that aggregates two other oracles
/// @notice This oracle will use two other oracles to support price quotes
interface IOracleAggregator is IPriceOracle {
  /// @notice The oracle that is currently in use by a specific pair
  enum OracleInUse {
    // No oracle is being used right now for the pair
    NONE,
    // Oracle 1 is being used for the pair
    ORACLE_1,
    // Oracle 2 is being used for the pair
    ORACLE_2
  }

  /// @notice Returns the first oracle of the two being aggregated
  /// @return The first oracle
  function oracle1() external view returns (IPriceOracle);

  /// @notice Returns the second oracle of the two being aggregated
  /// @return The second oracle
  function oracle2() external view returns (IPriceOracle);

  /// @notice Returns the oracle that is being used for the given pair
  /// @dev It is expected that _tokenA < _tokenB
  /// @return The oracle that is being used for the given pair
  function oracleInUse(address _tokenA, address _tokenB) external view returns (OracleInUse);

  /// @notice Overrides the default and sets oracle2 as the oracle for the pair (while also configuring it for use)
  /// @dev _tokenA and _tokenB may be passed in either tokenA/tokenB or tokenB/tokenA order
  /// @param _tokenA One of the pair's tokens
  /// @param _tokenB The other of the pair's tokens
  function overrideDefault(address _tokenA, address _tokenB) external;
}
