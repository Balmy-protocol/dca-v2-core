// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.4;

import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/utils/structs/EnumerableSet.sol';

import '../interfaces/IDCAGlobalParameters.sol';
import '../interfaces/IERC20Detailed.sol';
import '../interfaces/IDCAPair.sol';
import '../libraries/CommonErrors.sol';

import './utils/Math.sol';

abstract contract DCAPairParameters is IDCAPairParameters {
  using EnumerableSet for EnumerableSet.UintSet;

  // Internal constants
  uint112 internal immutable _magnitudeA;
  uint112 internal immutable _magnitudeB;
  uint24 internal immutable _feePrecision;

  // Basic setup
  IDCAGlobalParameters public override globalParameters;
  IERC20Detailed public override tokenA;
  IERC20Detailed public override tokenB;

  // Tracking
  mapping(uint32 => mapping(address => mapping(uint32 => int256))) public override swapAmountDelta; // swap interval => from token => swap number => delta
  mapping(uint32 => uint32) public override performedSwaps; // swap interval => performed swaps
  mapping(uint32 => mapping(address => mapping(uint32 => uint256))) internal _accumRatesPerUnit; // swap interval => from token => swap number => accum
  mapping(address => uint256) internal _balances;
  EnumerableSet.UintSet internal _activeSwapIntervals;

  constructor(
    IDCAGlobalParameters _globalParameters,
    IERC20Detailed _tokenA,
    IERC20Detailed _tokenB
  ) {
    if (address(_globalParameters) == address(0) || address(_tokenA) == address(0) || address(_tokenB) == address(0))
      revert CommonErrors.ZeroAddress();
    globalParameters = _globalParameters;
    _feePrecision = globalParameters.FEE_PRECISION();
    tokenA = _tokenA;
    tokenB = _tokenB;
    _magnitudeA = uint112(10**_tokenA.decimals());
    _magnitudeB = uint112(10**_tokenB.decimals());
  }

  function activeSwapIntervals() external view override returns (uint32[] memory __activeSwapIntervals) {
    uint256 _activeSwapIntervalsLength = _activeSwapIntervals.length();
    __activeSwapIntervals = new uint32[](_activeSwapIntervalsLength);
    for (uint256 i; i < _activeSwapIntervalsLength; i++) {
      __activeSwapIntervals[i] = uint32(_activeSwapIntervals.at(i));
    }
  }

  function _getFeeFromAmount(uint32 _feeAmount, uint256 _amount) internal view returns (uint256) {
    return (_amount * _feeAmount) / _feePrecision / 100;
  }
}
