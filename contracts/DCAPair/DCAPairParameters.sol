//SPDX-License-Identifier: Unlicense
pragma solidity 0.7.0;
pragma experimental ABIEncoderV2;

import 'hardhat/console.sol';

import '@openzeppelin/contracts/math/SafeMath.sol';
import '@openzeppelin/contracts/math/Math.sol';
import '@openzeppelin/contracts/math/SignedSafeMath.sol';
import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/token/ERC20/SafeERC20.sol';

import '../DCAFactory/DCAFactory.sol';
import '../interfaces/IERC20Decimals.sol';

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

  /* Public getters */
  function factory() external view returns (IDCAFactory);

  function tokenA() external view returns (IERC20Decimals);

  function tokenB() external view returns (IERC20Decimals);

  function swapAmountDelta(address, uint256) external view returns (int256);

  function userTrades(uint256)
    external
    returns (
      address,
      uint256,
      uint256,
      uint256
    );

  function performedSwaps() external returns (uint256);
}

abstract contract DCAPairParameters is IDCAPairParameters {
  // Basic setup
  IDCAFactory public override factory;
  IERC20Decimals public override tokenA;
  IERC20Decimals public override tokenB;

  // Tracking
  mapping(address => mapping(uint256 => int256)) public override swapAmountDelta;
  mapping(address => mapping(uint256 => uint256[2])) public accumRatesPerUnit;
  mapping(uint256 => DCA) public override userTrades;
  uint256 public override performedSwaps;

  constructor(IERC20Decimals _tokenA, IERC20Decimals _tokenB) {
    _setTokenA(_tokenA);
    _setTokenB(_tokenB);
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
    emit TokenBSet(_tokenB);
  }
}
