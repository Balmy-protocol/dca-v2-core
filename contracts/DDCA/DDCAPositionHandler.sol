//SPDX-License-Identifier: Unlicense
pragma solidity 0.7.0;

import './DDCASwapHandler.sol';

interface IDDCAPositionHandler {
  event Terminated(
    address indexed _depositor,
    uint256 _canceledDate,
    uint256 _startDate,
    uint256 _endDate,
    uint256 _amountPerDay
  );
  event Deposited(
    address indexed _depositor,
    uint256 _rate,
    uint256 _startingSwap,
    uint256 _lastSwap
  );

  function deposit(uint256 _rate, uint256 _amountOfSwaps) external;

  function withdrawSwapped() external returns (uint256 _swapped);

  function modifyRate(uint256 _newRate) external;

  function modifyRateAndSwaps(uint256 _newRate, uint256 _newSwaps) external;

  function terminate() external;

  function availableSwapped() external returns (uint256);
}

abstract contract DDCAPositionHandler is DDCASwapHandler, IDDCAPositionHandler {
  using SafeERC20 for IERC20;
  using SafeMath for uint256;
  using SignedSafeMath for int256;

  function _deposit(uint256 _rate, uint256 _amountOfSwaps) internal {
    from.safeTransferFrom(msg.sender, address(this), _rate.mul(_amountOfSwaps));
    uint256 _startingSwap = performedSwaps.add(1);
    uint256 _finalSwap = _startingSwap.add(_amountOfSwaps);
    swapAmountDelta[_startingSwap] += int256(_rate); // TODO: use SignedSafeMath
    swapAmountDelta[_finalSwap] -= int256(_rate); // TODO: use SignedSafeMath
    userTrades[msg.sender] = DCA(_rate, _startingSwap, _finalSwap);
    emit Deposited(msg.sender, _rate, _startingSwap, _finalSwap);
  }

  function _withdrawSwapped() internal returns (uint256 _swapped) {}

  function _terminate() internal {
    // DCA memory _userDCA = userTrades[msg.sender];
    // uint256 _finalDate = _userDCA.endDate;
    // if (today < _userDCA.endDate) {
    //   _finalDate = today;
    //   swapAmountDelta[today] -= int256(_userDCA.amountPerDay);
    //   swapAmountDelta[_userDCA.endDate] += int256(_userDCA.amountPerDay);
    //   uint256 _unusedFromUser =
    //     _userDCA.amountPerDay * (_userDCA.endDate - _finalDate);
    //   from.safeTransfer(msg.sender, _unusedFromUser);
    // }
    // uint256 _boughtForUser =
    //   _userDCA.amountPerDay *
    //     (averageRatesPerUnit[_finalDate] -
    //       averageRatesPerUnit[_userDCA.startDate - 1]);
    // to.safeTransfer(msg.sender, _boughtForUser);
    // delete userTrades[msg.sender];
    // emit Canceled(
    //   msg.sender,
    //   _finalDate,
    //   _userDCA.startDate,
    //   _userDCA.endDate,
    //   _userDCA.amountPerDay
    // );
  }

  function availableSwapped() external override returns (uint256) {
    return 0;
  }
}

// - deposit
// - changeAmountPerDay
// - cancel
// - extendEndDate
// - shortenEndDate
// - withdrawSwappedAssets
// - withdrawAllSwappedAssets
