//SPDX-License-Identifier: Unlicense
pragma solidity 0.7.0;

import 'hardhat/console.sol';

import '@openzeppelin/contracts/token/ERC20/SafeERC20.sol';

import './DDCAProtocolParameters.sol';

interface IDDCASwapHandler {
  event Swapped(
    uint256 _fromAmountSent,
    uint256 _toAmountReceived,
    uint256 _ratePerUnit
  );
  function amountAccumulator() external returns (uint256);
  function swap() external;
}

abstract 
contract DDCASwapHandler is DDCAProtocolParameters, IDDCASwapHandler {
  using SafeERC20 for IERC20;

  uint256 public override amountAccumulator;

  function _swap() internal {
    if (int256(amountAccumulator) + amountDiff[today] == 0) return;
    require(
      int256(amountAccumulator) + amountDiff[today] > 0,
      'what in the hell?'
    );
    amountAccumulator += uint256(amountDiff[today]);
    uint256 _balanceBeforeSwap = to.balanceOf(address(this));
    _uniswapSwap(amountAccumulator);
    uint256 _boughtBySwap = to.balanceOf(address(this)) - _balanceBeforeSwap;
    uint256 _ratePerUnit = (_boughtBySwap * MAGNITUDE) / amountAccumulator;
    averageRatesPerUnit[today] = (today == 0)
      ? _ratePerUnit
      : averageRatesPerUnit[today - 1] + _ratePerUnit;
    emit Swapped(
      amountAccumulator,
      _boughtBySwap,
      _ratePerUnit
    );
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
      0,
      _path,
      address(this),
      block.timestamp + 1800
    );
  }
}
