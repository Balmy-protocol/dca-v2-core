//SPDX-License-Identifier: Unlicense
pragma solidity 0.7.0;

import 'hardhat/console.sol';

import './DDCAProtocolParameters.sol';

interface IDDCASwapHandler {
  event SwapIntervalSet(uint256 _swapInterval);

  event Swapped(
    uint256 _fromAmountSent,
    uint256 _toAmountReceived,
    uint256 _ratePerUnit
  );

  function swapInterval() external returns (uint256);

  function lastSwapPerformed() external returns (uint256);

  function swapAmountAccumulator() external returns (uint256);

  function performedSwaps() external returns (uint256);

  function setSwapInterval(uint256) external;

  function swap() external;
}

abstract contract DDCASwapHandler is DDCAProtocolParameters, IDDCASwapHandler {
  using SafeERC20 for IERC20;
  using SafeMath for uint256;
  using SignedSafeMath for int256;

  uint256 public override swapAmountAccumulator;
  uint256 public override swapInterval;
  uint256 public override lastSwapPerformed;
  uint256 public override performedSwaps;

  constructor(uint256 _swapInterval) {
    _setSwapInterval(_swapInterval);
  }

  function _setSwapInterval(uint256 _swapInterval) internal {
    require(
      _swapInterval >= MINIMUM_SWAP_INTERVAL,
      'DDCASH: interval too short'
    );
    swapInterval = _swapInterval;
    emit SwapIntervalSet(_swapInterval);
  }

  function _swap() internal {
    require(
      lastSwapPerformed <= block.timestamp.sub(swapInterval),
      'DDCASH: within swap interval'
    );
    uint256 _newPerformedSwaps = performedSwaps.add(1);
    require(
      int256(swapAmountAccumulator) + swapAmountDelta[_newPerformedSwaps] > 0,
      'DDCASH: amount should be > 0'
    );
    swapAmountAccumulator += uint256(swapAmountDelta[_newPerformedSwaps]);
    uint256 _balanceBeforeSwap = to.balanceOf(address(this));
    _uniswapSwap(swapAmountAccumulator);
    uint256 _boughtBySwap = to.balanceOf(address(this)).sub(_balanceBeforeSwap);
    // TODO: Add some checks, for example to verify that _boughtBySwap is positive?. Even though it should never happen, let's be safe
    // console.log('bought by swap %s', _boughtBySwap);
    uint256 _ratePerUnit =
      (_boughtBySwap.mul(MAGNITUDE)).div(swapAmountAccumulator);
    // console.log('rate per unit %s', _ratePerUnit);
    // console.log('overflow guard %s', OVERFLOW_GUARD);
    // console.log(
    //   'accumRatesPerUnit[performedSwaps][0] %s',
    //   accumRatesPerUnit[performedSwaps][0]
    // );
    // console.log(
    //   'OVERFLOW_GUARD.sub(accumRatesPerUnit[performedSwaps][0]) %s',
    //   OVERFLOW_GUARD.sub(accumRatesPerUnit[performedSwaps][0])
    // );
    if (_newPerformedSwaps == 1) {
      accumRatesPerUnit[_newPerformedSwaps] = [_ratePerUnit, 0];
    } else if (
      _ratePerUnit >= OVERFLOW_GUARD.sub(accumRatesPerUnit[performedSwaps][0]) // TODO: Assume that OVERFLOW_GUARD = Max number and check if accumRatesPerUnit[performedSwaps][0] + _ratePerUnit < accumRatesPerUnit[performedSwaps][0]?
    ) {
      uint256 _missingUntilOverflow =
        OVERFLOW_GUARD.sub(accumRatesPerUnit[performedSwaps][0]);
      accumRatesPerUnit[_newPerformedSwaps] = [
        _ratePerUnit.sub(_missingUntilOverflow),
        accumRatesPerUnit[performedSwaps][1].add(1)
      ];
    } else {
      accumRatesPerUnit[_newPerformedSwaps] = [
        accumRatesPerUnit[performedSwaps][0].add(_ratePerUnit),
        accumRatesPerUnit[performedSwaps][1]
      ];
    }
    delete swapAmountDelta[performedSwaps];
    performedSwaps = _newPerformedSwaps;
    emit Swapped(swapAmountAccumulator, _boughtBySwap, _ratePerUnit);
  }

  function _uniswapSwap(uint256 _amount) internal {
    // Approve given erc20
    from.safeApprove(address(uniswap), 0);
    from.safeApprove(address(uniswap), _amount);
    // Create path
    address[] memory _path = new address[](2);
    _path[0] = address(from);
    _path[1] = address(to);
    // Swap it
    uniswap.swapExactTokensForTokens(
      _amount,
      0, // TODO: Should be set to protect against slippage / sandwitch attack. or change to zrx or 1inch or sth.
      _path,
      address(this),
      block.timestamp + 1800
    );
  }
}
