// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0 <0.8.0;

import '@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol';
import '@uniswap/v3-periphery/contracts/libraries/WeightedOracleLibrary.sol';

/// @title Weighted Oracle library
/// @notice This library is a wrapper of Uniswap's library, just to perform some small gas optimizations
library UniswapWeightedOracleLibrary {
  function consultMany(address[] memory pools, uint32 period)
    internal
    view
    returns (WeightedOracleLibrary.PeriodObservation[] memory observations)
  {
    observations = new WeightedOracleLibrary.PeriodObservation[](pools.length);
    uint192 periodX160 = uint192(period) * type(uint160).max;
    uint32[] memory secondsAgos = new uint32[](2);
    secondsAgos[0] = period;
    secondsAgos[1] = 0;
    for (uint256 i; i < pools.length; i++) {
      observations[i] = consult(pools[i], period, periodX160, secondsAgos);
    }
  }

  function consult(
    address pool,
    uint32 period,
    uint192 periodX160,
    uint32[] memory secondsAgos
  ) internal view returns (WeightedOracleLibrary.PeriodObservation memory observation) {
    (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityCumulativeX128s) = IUniswapV3Pool(pool).observe(secondsAgos);
    int56 tickCumulativesDelta = tickCumulatives[1] - tickCumulatives[0];
    uint160 secondsPerLiquidityCumulativesDelta = secondsPerLiquidityCumulativeX128s[1] - secondsPerLiquidityCumulativeX128s[0];

    observation.arithmeticMeanTick = int24(tickCumulativesDelta / period);
    // Always round to negative infinity
    if (tickCumulativesDelta < 0 && (tickCumulativesDelta % period != 0)) observation.arithmeticMeanTick--;

    // We are shifting the liquidity delta to ensure that the result doesn't overflow uint128
    observation.harmonicMeanLiquidity = uint128(periodX160 / (uint192(secondsPerLiquidityCumulativesDelta) << 32));
  }
}
