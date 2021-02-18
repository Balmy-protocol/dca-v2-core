//SPDX-License-Identifier: Unlicense
pragma solidity 0.7.0;

import 'hardhat/console.sol';

import '@openzeppelin/contracts/math/SafeMath.sol';
import '@openzeppelin/contracts/math/SignedSafeMath.sol';
import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/token/ERC20/SafeERC20.sol';

import '@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol';

import '../DCAFactory/DCAFactory.sol';
import '../interfaces/IERC20Decimals.sol';

interface IDCAPairParameters {
  struct DCA {
    uint256 rate;
    uint256 lastWithdrawSwap;
    uint256 lastSwap;
  }

  /* Events */
  event FromSet(IERC20Decimals _from);
  event ToSet(IERC20Decimals _to);
  event FactorySet(IDCAFactory _factory);
  event UniswapSet(IUniswapV2Router02 _uniswap);

  /* Public getters */
  function factory() external view returns (IDCAFactory);

  function from() external view returns (IERC20Decimals);

  function to() external view returns (IERC20Decimals);

  function uniswap() external view returns (IUniswapV2Router02);

  function swapAmountDelta(uint256) external view returns (int256);

  // TODO: function accumRatesPerUnit(uint256) external returns (uint256[2] memory);

  // TODO: function userTrades(uint256) external returns (DCA);
}

abstract contract DCAPairParameters is IDCAPairParameters {
  uint256 internal _magnitude;

  // Basic setup
  IDCAFactory public override factory;
  IERC20Decimals public override from;
  IERC20Decimals public override to;
  IUniswapV2Router02 public override uniswap;

  // Tracking
  mapping(uint256 => int256) public override swapAmountDelta;
  mapping(uint256 => uint256[2]) public accumRatesPerUnit;
  mapping(uint256 => DCA) public userTrades;

  constructor(
    IERC20Decimals _from,
    IERC20Decimals _to,
    IUniswapV2Router02 _uniswap
  ) {
    _setFrom(_from);
    _setTo(_to);
    _setUniswap(_uniswap);
  }

  function _setFactory(IDCAFactory _factory) internal {
    require(address(_factory) != address(0), 'DCAPair: zero-address');
    factory = _factory;
    emit FactorySet(_factory);
  }

  function _setFrom(IERC20Decimals _from) internal {
    require(address(_from) != address(0), 'DCAPair: zero-address');
    from = _from;
    emit FromSet(_from);
  }

  function _setTo(IERC20Decimals _to) internal {
    require(address(_to) != address(0), 'DCAPair: zero-address');
    to = _to;
    _magnitude = 10**_to.decimals();
    emit ToSet(_to);
  }

  function _setUniswap(IUniswapV2Router02 _uniswap) internal {
    require(address(_uniswap) != address(0), 'DCAPair: zero-address');
    uniswap = _uniswap;
    emit UniswapSet(_uniswap);
  }
}
