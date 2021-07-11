// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

import '@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol';

interface ITimeWeightedOracle {
  event AddedSupportForPair(address _tokenA, address _tokenB);

  /** Returns whether this oracle can support this pair of tokens */
  function canSupportPair(address _tokenA, address _tokenB) external view returns (bool);

  /** Returns a quote, based on the given tokens and amount */
  function quote(
    address _tokenIn,
    uint128 _amountIn,
    address _tokenOut
  ) external view returns (uint256 _amountOut);

  /**
   * Let the oracle take some actions to configure this pair of tokens for future uses.
   * Will revert if pair cannot be supported.
   */
  function addSupportForPair(address _tokenA, address _tokenB) external;
}

interface IUniswapV3OracleAggregator is ITimeWeightedOracle {
  event AddedFeeTier(uint24 _feeTier);
  event PeriodChanged(uint32 _period);

  /* Public getters */
  function factory() external view returns (IUniswapV3Factory);

  function supportedFeeTiers() external view returns (uint24[] memory);

  function poolsUsedForPair(address _tokenA, address _tokenB) external view returns (address[] memory);

  function period() external view returns (uint16);

  // solhint-disable-next-line func-name-mixedcase
  function MINIMUM_PERIOD() external view returns (uint16);

  // solhint-disable-next-line func-name-mixedcase
  function MAXIMUM_PERIOD() external view returns (uint16);

  /* Public setters */
  function addFeeTier(uint24) external;

  function setPeriod(uint16) external;
}
