//SPDX-License-Identifier: Unlicense
pragma solidity 0.7.0;

import '@openzeppelin/contracts/token/ERC20/SafeERC20.sol';

import './DDCAProtocolParameters.sol';

interface IDDCAPositionHandler {
  event Canceled(
    address indexed _depositor,
    uint256 _canceledDate,
    uint256 _startDate,
    uint256 _endDate,
    uint256 _amountPerDay
  );
  event Deposited(
    address indexed _depositor,
    uint256 _startDate,
    uint256 _endDate,
    uint256 _amountPerDay
  );

  function deposit(
    uint256 _startDate,
    uint256 _endDate,
    uint256 _amountPerDay
  ) external;
  
  function cancel() external;

  // function extendEndDate(uint256 _endDate) external;

  // function shortEndDate(uint256 _endDate) external;
}

abstract 
contract DDCAPositionHandler is DDCAProtocolParameters, IDDCAPositionHandler {
  using SafeERC20 for IERC20;

  function _deposit(
    uint256 _startDate,
    uint256 _endDate,
    uint256 _amountPerDay
  ) internal {
    // it will not include the day of the last buy
    from.safeTransferFrom(
      msg.sender,
      address(this),
      _amountPerDay * (_endDate - _startDate)
    );
    amountDiff[_startDate] += int256(_amountPerDay);
    amountDiff[_endDate] -= int256(_amountPerDay);
    userTrades[msg.sender] = DCA(_startDate, _endDate, _amountPerDay);
    emit Deposited(msg.sender, _startDate, _endDate, _amountPerDay);
  }

  function _cancel() internal {
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
    emit Canceled(
      msg.sender,
      _finalDate,
      _userDCA.startDate,
      _userDCA.endDate,
      _userDCA.amountPerDay
    );
  }
}

// - deposit
// - changeAmountPerDay
// - cancel
// - extendEndDate
// - shortenEndDate
// - withdrawSwappedAssets
// - withdrawAllSwappedAssets
