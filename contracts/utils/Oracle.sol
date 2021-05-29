// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import '@uniswap/v3-periphery/contracts/libraries/OracleLibrary.sol';

/// @title Safe uint128 casting methods
/// @notice Contains methods for safely casting between types
library SafeUint128 {
  /// @notice Cast a uint256 to a uint128, revert on overflow
  /// @param y The uint256 to be downcasted
  /// @return z The downcasted integer, now type uint128
  function toUint128(uint256 y) internal pure returns (uint128 z) {
    require((z = uint128(y)) == y);
  }
}

contract Oracle {
  constructor() {}

  // function getPoolWithMostLiquidity() {}

  function getTwap(
    address _pool,
    address _tokenIn,
    uint256 _amountIn,
    address _tokenOut,
    uint32 _period
  ) external view returns (uint256 _amountOut) {
    int256 twapTick = OracleLibrary.consult(_pool, _period);
    _amountOut = OracleLibrary.getQuoteAtTick(int24(twapTick), SafeUint128.toUint128(_amountIn), _tokenIn, _tokenOut);
  }
}
