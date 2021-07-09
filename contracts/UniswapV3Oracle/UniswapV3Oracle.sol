// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.4;

import '@openzeppelin/contracts/utils/structs/EnumerableSet.sol';
import '../interfaces/ITimeWeightedOracle.sol';
import '../utils/Governable.sol';
import '../libraries/CommonErrors.sol';

contract UniswapV3Oracle is IUniswapV3OracleAggregator, Governable {
  using EnumerableSet for EnumerableSet.UintSet;

  IUniswapV3Factory public override factory;
  EnumerableSet.UintSet internal _supportedFeeTiers;

  constructor(address _governor, IUniswapV3Factory _factory) Governable(_governor) {
    if (address(_factory) == address(0)) revert CommonErrors.ZeroAddress();
    factory = _factory;
  }

  function supportedFeeTiers() external view override returns (uint24[] memory _feeTiers) {
    uint256 _length = _supportedFeeTiers.length();
    _feeTiers = new uint24[](_length);
    for (uint256 i; i < _length; i++) {
      _feeTiers[i] = uint24(_supportedFeeTiers.at(i));
    }
  }

  function addFeeTier(uint24 _feeTier) external override onlyGovernor {
    if (factory.feeAmountTickSpacing(_feeTier) == 0) revert InvalidFeeTier();

    _supportedFeeTiers.add(_feeTier);

    emit AddedFeeTier(_feeTier);
  }
}
