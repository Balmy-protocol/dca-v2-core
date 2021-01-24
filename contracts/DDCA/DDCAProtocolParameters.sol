//SPDX-License-Identifier: Unlicense
pragma solidity 0.7.0;

import 'hardhat/console.sol';

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

import '@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol';

interface IDDCAProtocolParameters {
  struct DCA {
    uint256 startDate;
    uint256 endDate;
    uint256 amountPerDay;
  }

  /* Events */
  event FromSet(IERC20 _from);
  event ToSet(IERC20 _to);
  event UniswapSet(IUniswapV2Router02 _uniswap);

  /* Public getters */

  function from() external returns (IERC20);

  function to() external returns (IERC20);

  function uniswap() external returns (IUniswapV2Router02);

  function amountDiff(uint256) external returns (int256);

  function averageRatesPerUnit(uint256) external returns (uint256);

  // function userTrades(uint256) external returns (DCA);

  /* Public setters */
  function setFrom(IERC20 _from) external;

  function setTo(IERC20 _to) external;

  function setUniswap(IUniswapV2Router02 _uniswap) external;
}

abstract 
contract DDCAProtocolParameters is IDDCAProtocolParameters {
  uint256 internal constant MAGNITUDE = 10**18;

  // Basic setup
  IERC20 public override from;
  IERC20 public override to;
  IUniswapV2Router02 public override uniswap;

  // Tracking
  mapping(uint256 => int256) public override amountDiff;
  mapping(uint256 => uint256) public override averageRatesPerUnit;
  mapping(address => DCA) public userTrades;

  // just for testing poc, must be deleted
  uint256 public today;

  constructor(
    IERC20 _from,
    IERC20 _to,
    IUniswapV2Router02 _uniswap
  ) {
    _setFrom(_from);
    _setTo(_to);
    _setUniswap(_uniswap);
  }

  function _setFrom(IERC20 _from) internal {
    require(address(_from) != address(0), 'DDCAPP: zero-address');
    from = _from;
    emit FromSet(_from);
  }

  function _setTo(IERC20 _to) internal {
    require(address(_to) != address(0), 'DDCAPP: zero-address');
    to = _to;
    emit ToSet(_to);
  }

  function _setUniswap(IUniswapV2Router02 _uniswap) internal {
    require(address(_uniswap) != address(0), 'DDCAPP: zero-address');
    uniswap = _uniswap;
    emit UniswapSet(_uniswap);
  }
}
