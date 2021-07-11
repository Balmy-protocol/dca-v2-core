// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.8.4;

import '@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol';

interface ITimeWeightedOracle {
  /** Returns whether this oracle supports this pair of tokens */
  function supportsPair(address _tokenA, address _tokenB) external view returns (bool);

  /** Returns a quote, based on the given tokens and amount */
  function quote(
    address _tokenIn,
    uint256 _amountIn,
    address _tokenOut
  ) external view returns (uint256 _amountOut);

  /**
   * Let the oracle take some actions to prepare for this new pair of tokens.
   * Will revert if pair is not supported.
   */
  function initializePair(address _tokenA, address _tokenB) external;
}

interface IUniswapV3OracleAggregator is ITimeWeightedOracle {
  event AddedFeeTier(uint24 _feeTier);
  event PeriodChanged(uint32 _period);

  error InvalidFeeTier();
  error GreaterThanMaximumPeriod();
  error LessThanMinimumPeriod();

  /* Public getters */
  function factory() external view returns (IUniswapV3Factory);

  function supportedFeeTiers() external view returns (uint24[] memory);

  function period() external view returns (uint32);

  // solhint-disable-next-line func-name-mixedcase
  function MINIMUM_PERIOD() external view returns (uint32);

  // solhint-disable-next-line func-name-mixedcase
  function MAXIMUM_PERIOD() external view returns (uint32);

  /* Public setters */
  function addFeeTier(uint24) external;

  function setPeriod(uint32) external;
}