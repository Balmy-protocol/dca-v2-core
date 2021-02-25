//SPDX-License-Identifier: Unlicense
pragma solidity 0.7.0;

import 'hardhat/console.sol';

import './DCAPairParameters.sol';

interface IDCAPairSwapHandler {
  event SwapIntervalSet(uint256 _swapInterval);

  event Swapped(uint256 _fromSent, uint256 _toReceived, uint256 _ratePerUnit);

  function swapInterval() external returns (uint256);

  function lastSwapPerformed() external returns (uint256);

  function swapAmountAccumulator() external returns (uint256);

  function performedSwaps() external returns (uint256);

  function setSwapInterval(uint256) external;

  function swap() external;
}

abstract contract DCAPairSwapHandler is DCAPairParameters, IDCAPairSwapHandler {
  using SafeERC20 for IERC20Decimals;
  using SafeMath for uint256;
  using SignedSafeMath for int256;

  uint256 internal constant MINIMUM_SWAP_INTERVAL = 1 minutes;

  uint256 public override swapAmountAccumulator;
  uint256 public override swapInterval;
  uint256 public override lastSwapPerformed;
  uint256 public override performedSwaps;

  constructor(IDCAFactory _factory, uint256 _swapInterval) {
    _setFactory(_factory);
    _setSwapInterval(_swapInterval);
  }

  function _setSwapInterval(uint256 _swapInterval) internal {
    require(_swapInterval >= MINIMUM_SWAP_INTERVAL, 'DCAPair: interval too short');
    swapInterval = _swapInterval;
    emit SwapIntervalSet(_swapInterval);
  }

  function _getAmountToSwap(uint256 _swap) internal view returns (uint256 _swapAmountAccumulator) {
    _swapAmountAccumulator = swapAmountAccumulator + uint256(swapAmountDelta[_swap]);
  }

  function _addNewRatePerUnit(uint256 _swap, uint256 _ratePerUnit) internal {
    uint256 _previousSwap = _swap - 1;
    if (_swap == 1) {
      accumRatesPerUnit[_swap] = [_ratePerUnit, 0];
    } else if (accumRatesPerUnit[_previousSwap][0] + _ratePerUnit < accumRatesPerUnit[_previousSwap][0]) {
      uint256 _missingUntilOverflow = type(uint256).max.sub(accumRatesPerUnit[_previousSwap][0]);
      accumRatesPerUnit[_swap] = [_ratePerUnit.sub(_missingUntilOverflow), accumRatesPerUnit[_previousSwap][1].add(1)];
    } else {
      accumRatesPerUnit[_swap] = [accumRatesPerUnit[_previousSwap][0].add(_ratePerUnit), accumRatesPerUnit[_previousSwap][1]];
    }
  }

  function _swap() internal {
    require(lastSwapPerformed <= block.timestamp.sub(swapInterval), 'DCAPair: within swap interval');
    uint256 _newPerformedSwaps = performedSwaps.add(1);
    uint256 _balanceBeforeSwap = to.balanceOf(address(this));
    swapAmountAccumulator = _getAmountToSwap(_newPerformedSwaps);
    _uniswapSwap(swapAmountAccumulator);
    uint256 _boughtBySwap = to.balanceOf(address(this)).sub(_balanceBeforeSwap);
    // TODO: Add some checks, for example to verify that _boughtBySwap is positive?. Even though it should never happen, let's be safe
    uint256 _ratePerUnit = (_boughtBySwap.mul(_magnitude)).div(swapAmountAccumulator);
    _addNewRatePerUnit(_newPerformedSwaps, _ratePerUnit);
    delete swapAmountDelta[_newPerformedSwaps];
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
    // TODO: Send fee to fee recipient
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
