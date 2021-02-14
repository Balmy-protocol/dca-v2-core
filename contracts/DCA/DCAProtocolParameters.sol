//SPDX-License-Identifier: Unlicense
pragma solidity 0.7.0;

import "hardhat/console.sol";

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/math/SignedSafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";

import "../interfaces/IERC20Decimals.sol";

interface IDCAProtocolParameters {
  struct DCA {
    uint256 rate;
    uint256 lastWithdrawSwap;
    uint256 lastSwap;
  }

  /* Events */
  event FeeRecipientSet(address _feeRecipient);
  event FromSet(IERC20Decimals _from);
  event ToSet(IERC20Decimals _to);
  event UniswapSet(IUniswapV2Router02 _uniswap);

  /* Public getters */

  function feeRecipient() external returns (address);

  function from() external returns (IERC20Decimals);

  function to() external returns (IERC20Decimals);

  function uniswap() external returns (IUniswapV2Router02);

  function swapAmountDelta(uint256) external returns (int256);

  // TODO: function accumRatesPerUnit(uint256) external returns (uint256[2] memory);

  // TODO: function userTrades(uint256) external returns (DCA);

  /* Public setters */
  function setFeeRecipient(address _feeRecipient) external;

  function setFrom(IERC20Decimals _from) external;

  function setTo(IERC20Decimals _to) external;

  function setUniswap(IUniswapV2Router02 _uniswap) external;
}

abstract contract DCAProtocolParameters is IDCAProtocolParameters {
  uint256 internal _magnitude;

  // Basic setup
  address public override feeRecipient;
  IERC20Decimals public override from;
  IERC20Decimals public override to;
  IUniswapV2Router02 public override uniswap;

  // Tracking
  mapping(uint256 => int256) public override swapAmountDelta;
  mapping(uint256 => uint256[2]) public accumRatesPerUnit;
  mapping(address => DCA) public userTrades; // TODO: Deprecate to use IDs

  constructor(
    address _feeRecipient,
    IERC20Decimals _from,
    IERC20Decimals _to,
    IUniswapV2Router02 _uniswap
  ) {
    _setFeeRecipient(_feeRecipient);
    _setFrom(_from);
    _setTo(_to);
    _setUniswap(_uniswap);
  }

  function _setFeeRecipient(address _feeRecipient) internal {
    require(_feeRecipient != address(0), "DCAPP: zero-address");
    feeRecipient = _feeRecipient;
    emit FeeRecipientSet(_feeRecipient);
  }

  function _setFrom(IERC20Decimals _from) internal {
    require(address(_from) != address(0), "DCAPP: zero-address");
    from = _from;
    emit FromSet(_from);
  }

  function _setTo(IERC20Decimals _to) internal {
    require(address(_to) != address(0), "DCAPP: zero-address");
    to = _to;
    _magnitude = 10**_to.decimals();
    emit ToSet(_to);
  }

  function _setUniswap(IUniswapV2Router02 _uniswap) internal {
    require(address(_uniswap) != address(0), "DCAPP: zero-address");
    uniswap = _uniswap;
    emit UniswapSet(_uniswap);
  }
}
