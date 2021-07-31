// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.6;

import '@openzeppelin/contracts/utils/structs/EnumerableSet.sol';
import '../utils/Governable.sol';

import '../interfaces/IDCAKeep3rJob.sol';
import '../interfaces/IKeep3rV1.sol';
import '../interfaces/IDCASwapper.sol';

import '../libraries/CommonErrors.sol';

contract DCAKeep3rJob is IDCAKeep3rJob, Governable {
  using EnumerableSet for EnumerableSet.AddressSet;

  IDCAFactory public immutable override factory;
  IDCASwapper public override swapper;
  IKeep3rV1 public override keep3rV1;
  mapping(uint32 => uint32) internal _delay; // swap interval => delay
  EnumerableSet.AddressSet internal _subsidizedPairs;

  constructor(
    address _governor,
    IDCAFactory _factory,
    IKeep3rV1 _keep3rV1,
    IDCASwapper _swapper
  ) Governable(_governor) {
    if (address(_factory) == address(0) || address(_keep3rV1) == address(0) || address(_swapper) == address(0))
      revert CommonErrors.ZeroAddress();
    factory = _factory;
    keep3rV1 = _keep3rV1;
    swapper = _swapper;
  }

  function setKeep3rV1(IKeep3rV1 _keep3rV1) external override onlyGovernor {
    if (address(_keep3rV1) == address(0)) revert CommonErrors.ZeroAddress();
    keep3rV1 = _keep3rV1;
    emit Keep3rV1Set(_keep3rV1);
  }

  function setSwapper(IDCASwapper _swapper) external override onlyGovernor {
    if (address(_swapper) == address(0)) revert CommonErrors.ZeroAddress();
    swapper = _swapper;
    emit SwapperSet(_swapper);
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

  function setDelay(uint32 _swapInterval, uint32 __delay) external override onlyGovernor {
    _delay[_swapInterval] = __delay;
    emit DelaySet(_swapInterval, __delay);
  }

  function delay(uint32 _swapInterval) external view override returns (uint32 __delay) {
    __delay = _delay[_swapInterval];
    if (__delay == 0) {
      __delay = _swapInterval / 2;
    }
  }

  /**
   * This method isn't a view and it is extremelly expensive and inefficient.
   * DO NOT call this method on-chain, it is for off-chain purposes only.
   */
  function workable() external override returns (IDCASwapper.PairToSwap[] memory _pairs, uint32[] memory _smallestIntervals) {
    uint256 _count;
    // Count how many pairs can be swapped
    uint256 _length = _subsidizedPairs.length();
    for (uint256 i; i < _length; i++) {
      IDCAPair _pair = IDCAPair(_subsidizedPairs.at(i));
      bytes memory _swapPath = swapper.findBestSwap(_pair);
      uint32 _swapInterval = _getSmallestSwapInterval(_pair);
      if (_swapPath.length > 0 && _hasDelayPassedAlready(_pair, _swapInterval)) {
        _count++;
      }
    }
    // Create result array with correct size
    _pairs = new IDCASwapper.PairToSwap[](_count);
    _smallestIntervals = new uint32[](_count);

    // Fill result array
    for (uint256 i; i < _length; i++) {
      IDCAPair _pair = IDCAPair(_subsidizedPairs.at(i));
      bytes memory _swapPath = swapper.findBestSwap(_pair);
      uint32 _swapInterval = _getSmallestSwapInterval(_pair);
      if (_swapPath.length > 0 && _hasDelayPassedAlready(_pair, _swapInterval)) {
        _pairs[--_count] = IDCASwapper.PairToSwap({pair: _pair, swapPath: _swapPath});
        _smallestIntervals[_count] = _swapInterval;
      }
    }
  }

  /**
   * Takes an array of swaps, and executes as many as possible, returning the amount that was swapped
   */
  function work(IDCASwapper.PairToSwap[] calldata _pairsToSwap) external override returns (uint256 _amountSwapped) {
    if (!keep3rV1.isKeeper(msg.sender)) revert NotAKeeper();
    for (uint256 i; i < _pairsToSwap.length; i++) {
      if (!_subsidizedPairs.contains(address(_pairsToSwap[i].pair))) {
        revert PairNotSubsidized();
      }
    }
    _amountSwapped = swapper.swapPairs(_pairsToSwap);
    if (_amountSwapped == 0) revert NotWorked();
    keep3rV1.worked(msg.sender);
    emit Worked(_amountSwapped);
  }

  function _hasDelayPassedAlready(IDCAPair _pair, uint32 _swapInterval) internal view returns (bool) {
    uint32 _nextAvailable = _pair.nextSwapAvailable(_swapInterval);
    return _getTimestamp() >= _nextAvailable + this.delay(_swapInterval);
  }

  function _getSmallestSwapInterval(IDCAPair _pair) internal view returns (uint32 _minSwapInterval) {
    IDCAPair.NextSwapInformation memory _nextSwapInfo = _pair.getNextSwapInfo();
    for (uint256 i; i < _nextSwapInfo.amountOfSwaps; i++) {
      if (_minSwapInterval == 0 || _nextSwapInfo.swapsToPerform[i].interval < _minSwapInterval) {
        _minSwapInterval = _nextSwapInfo.swapsToPerform[i].interval;
      }
    }
  }

  function _getTimestamp() internal view virtual returns (uint32) {
    return uint32(block.timestamp);
  }
}
