//SPDX-License-Identifier: Unlicense
pragma solidity 0.7.0;

import 'hardhat/console.sol';

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/SafeERC20.sol';

import '@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol';

contract DDCA {
  using SafeERC20 for IERC20;

  // Helps to handle decimals, stolen from dividen token, it can be bigger.
  // calculations to know the limit needed.
  uint256 internal constant MAGNITUDE = 10**18;

  struct DCA {
    uint256 startDate;
    uint256 endDate;
    uint256 amountPerDay;
  }

  // Basic setup
  IERC20 public from;
  IERC20 public to;
  IUniswapV2Router02 public uniswapV2;

  // Tracking
  uint256 public amountAccumulator;
  mapping(uint256 => int256) public amountDiff;
  mapping(uint256 => uint256) public averageRatesPerUnit;
  mapping(address => DCA) public userTrades;

  uint256 public today;

  constructor(
    IERC20 _from,
    IERC20 _to,
    IUniswapV2Router02 _uniswapV2
  ) {
    from = _from;
    to = _to;
    uniswapV2 = _uniswapV2;
  }

  function deposit(
    uint256 _startDate,
    uint256 _endDate,
    uint256 _amountPerDay
  ) public {
    // it will not include the day of the last buy
    from.safeTransferFrom(
      msg.sender,
      address(this),
      _amountPerDay * (_endDate - _startDate)
    );
    amountDiff[_startDate] += int256(_amountPerDay);
    amountDiff[_endDate] -= int256(_amountPerDay);
    userTrades[msg.sender] = DCA(_startDate, _endDate, _amountPerDay);
  }

  function withdraw() public {
    DCA memory _userDCA = userTrades[msg.sender];
    uint256 _finalDate = _userDCA.endDate;
    if (today < _userDCA.endDate) {
      _finalDate = today;
      amountDiff[today] -= int256(_userDCA.amountPerDay);
      amountDiff[_userDCA.endDate] += int256(_userDCA.amountPerDay);
      uint256 _unusedFromUser =
        _userDCA.amountPerDay * (_userDCA.endDate - _finalDate);
      from.safeTransfer(msg.sender, _unusedFromUser);
    }
    uint256 _boughtForUser =
      _userDCA.amountPerDay *
        (averageRatesPerUnit[_finalDate] -
          averageRatesPerUnit[_userDCA.startDate - 1]);
    to.safeTransfer(msg.sender, _boughtForUser);
    delete userTrades[msg.sender];
  }

  function buy() public {
    console.log('TA %s', amountAccumulator);
    if (int256(amountAccumulator) + amountDiff[today] == 0) return;
    require(
      int256(amountAccumulator) + amountDiff[today] > 0,
      'what in the hell?'
    );
    amountAccumulator += uint256(amountDiff[today]);
    uint256 _previousBalance = to.balanceOf(address(this));
    _swap(amountAccumulator);
    uint256 _ratePerUnit =
      ((to.balanceOf(address(this)) - _previousBalance) * MAGNITUDE) /
        amountAccumulator;
    averageRatesPerUnit[today] = (today == 0)
      ? _ratePerUnit
      : averageRatesPerUnit[today - 1] + _ratePerUnit;
  }

  function swapped() public view returns (uint256) {
    return
      (userTrades[msg.sender].amountPerDay *
        (averageRatesPerUnit[today] -
          averageRatesPerUnit[userTrades[msg.sender].startDate - 1])) /
      MAGNITUDE;
  }

  function _swap(uint256 _amount) internal {
    // Approve given erc20
    from.safeApprove(address(uniswapV2), 0);
    from.safeApprove(address(uniswapV2), _amount);
    // Create path
    address[] memory _path = new address[](2);
    _path[0] = address(from);
    _path[1] = address(to);
    // Swap it
    uniswapV2.swapExactTokensForTokens(
      _amount,
      0,
      _path,
      address(this),
      block.timestamp + 1800
    );
  }

  // must be deleted, just for poc
  function setToday(uint256 _today) public {
    today = _today;
  }
}

// $start_of_day = time() - 86400 + (time() % 86400);
// $end_of_day = $start_of_day + 86400;
