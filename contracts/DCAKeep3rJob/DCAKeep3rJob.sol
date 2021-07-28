// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.4;

import '@openzeppelin/contracts/utils/structs/EnumerableSet.sol';
import '../utils/Governable.sol';
import '../interfaces/IDCAKeep3rJob.sol';
import '../libraries/CommonErrors.sol';

contract DCAKeep3rJob is IDCAKeep3rJob, Governable {
  using EnumerableSet for EnumerableSet.AddressSet;

  IDCAFactory public immutable override factory;
  IDCASwapper public immutable override swapper;
  EnumerableSet.AddressSet internal _subsidizedPairs;

  constructor(
    address _governor,
    IDCAFactory _factory,
    IDCASwapper _swapper
  ) Governable(_governor) {
    if (address(_factory) == address(0) || address(_swapper) == address(0)) revert CommonErrors.ZeroAddress();
    factory = _factory;
    swapper = _swapper;
  }

  /**
   * This method isn't a view and it is extremelly expensive and inefficient.
   * DO NOT call this method on-chain, it is for off-chain purposes only.
   */
  function getPairsToSwap() external override returns (IDCASwapper.PairToSwap[] memory _pairs) {
    uint256 _count;
    // Count how many pairs can be swapped
    uint256 _length = _subsidizedPairs.length();
    for (uint256 i; i < _length; i++) {
      if (swapper.bestFeeTierForSwap(IDCAPair(_subsidizedPairs.at(i))) > 0) {
        _count++;
      }
    }
    // Create result array with correct size
    _pairs = new IDCASwapper.PairToSwap[](_count);
    // Fill result array
    for (uint256 i; i < _length; i++) {
      IDCAPair _pair = IDCAPair(_subsidizedPairs.at(i));
      uint24 _feeTier = swapper.bestFeeTierForSwap(_pair);
      if (_feeTier > 0) {
        _pairs[--_count] = IDCASwapper.PairToSwap({pair: _pair, bestFeeTier: _feeTier});
      }
    }
  }

  function startSubsidizingPairs(address[] calldata _pairs) external override onlyGovernor {
    for (uint256 i; i < _pairs.length; i++) {
      if (!factory.isPair(_pairs[i])) revert InvalidPairAddress();
      _subsidizedPairs.add(_pairs[i]);
    }
    emit SubsidizingNewPairs(_pairs);
  }

  function stopSubsidizingPairs(address[] calldata _pairs) external override onlyGovernor {
    for (uint256 i; i < _pairs.length; i++) {
      _subsidizedPairs.remove(_pairs[i]);
    }
    emit StoppedSubsidizingPairs(_pairs);
  }

  function subsidizedPairs() external view override returns (address[] memory _pairs) {
    uint256 _length = _subsidizedPairs.length();
    _pairs = new address[](_length);
    for (uint256 i; i < _length; i++) {
      _pairs[i] = _subsidizedPairs.at(i);
    }
  }

  /**
   * Takes an array of swaps, and executes as many as possible, returning the amount that was swapped
   */
  function swapPairs(IDCASwapper.PairToSwap[] calldata _pairsToSwap) external override returns (uint256 _amountSwapped) {
    for (uint256 i; i < _pairsToSwap.length; i++) {
      if (!_subsidizedPairs.contains(address(_pairsToSwap[i].pair))) {
        revert PairNotSubsidized();
      }
    }
    _amountSwapped = swapper.swapPairs(_pairsToSwap);

    // TODO: Integrate with keep3r and emit event
  }
}
