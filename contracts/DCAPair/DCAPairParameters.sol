//SPDX-License-Identifier: Unlicense
pragma solidity 0.7.0;

import 'hardhat/console.sol';

import '@openzeppelin/contracts/math/SafeMath.sol';
import '@openzeppelin/contracts/math/Math.sol';
import '@openzeppelin/contracts/math/SignedSafeMath.sol';
import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/token/ERC20/SafeERC20.sol';

import '@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol';

import '../DCAFactory/DCAFactory.sol';
import '../interfaces/IERC20Decimals.sol';

pragma experimental ABIEncoderV2;

interface IDCAPairParameters {
  struct DCA {
    address from;
    uint256 rate;
    uint256 lastWithdrawSwap;
    uint256 lastSwap;
  }

  /* Events */
  event TokenASet(IERC20Decimals _tokenA);
  event TokenBSet(IERC20Decimals _tokenB);
  event FactorySet(IDCAFactory _factory);
  event UniswapSet(IUniswapV2Router02 _uniswap);

  /* Public getters */
  function factory() external view returns (IDCAFactory);

  function tokenA() external view returns (IERC20Decimals);

  function tokenB() external view returns (IERC20Decimals);

  function uniswap() external view returns (IUniswapV2Router02);

  function swapAmountDelta(address, uint256) external view returns (int256);

  // TODO: function accumRatesPerUnit(uint256) external returns (uint256[2] memory);

  function userTrades(uint256)
    external
    returns (
      address,
      uint256,
      uint256,
      uint256
    );
}

abstract contract DCAPairParameters is IDCAPairParameters {
  uint256 internal _magnitude;

  // Basic setup
  IDCAFactory public override factory;
  IERC20Decimals public override tokenA;
  IERC20Decimals public override tokenB;
  IUniswapV2Router02 public override uniswap;

  // Tracking
  mapping(address => mapping(uint256 => int256)) public override swapAmountDelta;
  mapping(address => mapping(uint256 => uint256[2])) public accumRatesPerUnit;
  mapping(uint256 => DCA) public override userTrades;

  constructor(
    IERC20Decimals _tokenA,
    IERC20Decimals _tokenB,
    IUniswapV2Router02 _uniswap
  ) {
    _setTokenA(_tokenA);
    _setTokenB(_tokenB);
    _setUniswap(_uniswap);
  }

  function _setFactory(IDCAFactory _factory) internal {
    require(address(_factory) != address(0), 'DCAPair: zero-address');
    factory = _factory;
    emit FactorySet(_factory);
  }

  function _setTokenA(IERC20Decimals _tokenA) internal {
    require(address(_tokenA) != address(0), 'DCAPair: zero-address');
    tokenA = _tokenA;
    emit TokenASet(_tokenA);
  }

  function _setTokenB(IERC20Decimals _tokenB) internal {
    require(address(_tokenB) != address(0), 'DCAPair: zero-address');
    tokenB = _tokenB;
    _magnitude = 10**_tokenB.decimals();
    emit TokenBSet(_tokenB);
  }

  function _setUniswap(IUniswapV2Router02 _uniswap) internal {
    require(address(_uniswap) != address(0), 'DCAPair: zero-address');
    uniswap = _uniswap;
    emit UniswapSet(_uniswap);
  }
}
