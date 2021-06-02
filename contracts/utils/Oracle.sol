// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

import '@uniswap/v3-periphery/contracts/libraries/OracleLibrary.sol';
import '../interfaces/IUniswapV3Factory.sol';

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
  uint24[] public enabledFees = [500, 3000, 10000];
  address public uniswapFactory = address(0xe);

  function _getBestPoolForPair(address _tokenA, address _tokenB) internal view {
    for (uint16 i = 0; i < enabledFees.length; i++) {
      address _pool = IUniswapV3Factory(uniswapFactory).getPool(_tokenA, _tokenB, enabledFees[i]);
      if (_pool != address(0)) {}
    }
  }

  function getTwap(
    address _pool,
    address _tokenIn,
    uint256 _amountIn,
    address _tokenOut,
    uint32 _period
  ) external view returns (uint256 _amountOut) {
    _amountOut = OracleLibrary.getQuoteAtTick(OracleLibrary.consult(_pool, _period), SafeUint128.toUint128(_amountIn), _tokenIn, _tokenOut);
  }
}
