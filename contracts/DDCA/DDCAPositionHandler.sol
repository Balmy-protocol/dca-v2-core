//SPDX-License-Identifier: Unlicense
pragma solidity 0.7.0;

import "./DDCASwapHandler.sol";

interface IDDCAPositionHandler {
  event Terminated(address indexed _depositor, uint256 _canceledDate, uint256 _startDate, uint256 _endDate, uint256 _amountPerDay);
  event Deposited(address indexed _depositor, uint256 _rate, uint256 _startingSwap, uint256 _lastSwap);

  function deposit(uint256 _rate, uint256 _amountOfSwaps) external;

  function withdrawSwapped() external returns (uint256 _swapped);

  function modifyRate(uint256 _newRate) external;

  function modifyRateAndSwaps(uint256 _newRate, uint256 _newSwaps) external;

  function terminate() external;
}

abstract contract DDCAPositionHandler is DDCASwapHandler, IDDCAPositionHandler {
  using SafeERC20 for IERC20;
  using SafeMath for uint256;
  using SignedSafeMath for int256;

  function _deposit(uint256 _rate, uint256 _amountOfSwaps) internal {
    from.safeTransferFrom(msg.sender, address(this), _rate.mul(_amountOfSwaps));
    _addPosition(_rate, _amountOfSwaps);
    // emit Deposited(msg.sender, _rate, _startingSwap, _finalSwap); TODO: Emit event
  }

  function _withdrawSwapped() internal returns (uint256 _swapped) {
    // TODO: Check that the sender actually has a position set

    _swapped = _calculateSwapped();

    if (_swapped > 0) {
      // TODO: update userTrades
      to.safeTransferFrom(address(this), msg.sender, _swapped);
    }

    // TODO: Emit event
  }

  function _terminate() internal {
    // TODO: Check that the sender actually has a position set

    uint256 _swapped = _calculateSwapped();
    uint256 _unswapped = _calculateUnswapped();

    _removePosition();

    if (_swapped > 0) {
      to.safeTransferFrom(address(this), msg.sender, _swapped);
    }

    if (_unswapped > 0) {
      from.safeTransferFrom(address(this), msg.sender, _unswapped);
    }

    // TODO: Emit event
  }

  function _modifyRate(uint256 _newRate) internal {
    // TODO: Check that the sender actually has a position set

    DCA memory _userDCA = userTrades[msg.sender];

    // TODO: Check if the position is already completed. If it is, then fail

    uint256 _swapsLeft = _userDCA.lastSwap.sub(performedSwaps);
    _modifyRateAndSwaps(_newRate, _swapsLeft);
  }

  function _modifySwaps(uint256 _newSwaps) internal {
    // TODO: Check that the sender actually has a position set

    DCA memory _userDCA = userTrades[msg.sender];

    _modifyRateAndSwaps(_userDCA.rate, _newSwaps);
  }

  function _modifyRateAndSwaps(uint256 _newRate, uint256 _newAmountOfSwaps) internal {
    // TODO: Check that the sender actually has a position set

    uint256 _unswapped = _calculateUnswapped();
    uint256 _totalNecessary = _newRate.mul(_newAmountOfSwaps);
    int256 _needed = int256(_totalNecessary - _unswapped);

    _removePosition();
    _addPosition(_newRate, _newAmountOfSwaps);

    if (_needed > 0) {
      // We need to ask for more funds
      from.safeTransferFrom(msg.sender, address(this), uint256(_needed));
    } else if (_needed < 0) {
      // We need to return to the owner the amount that won't be used anymore
      from.safeTransferFrom(address(this), msg.sender, uint256(_needed)); // TODO: Transfer 'uint256(abs(_needed))' here
    }
  }

  function _addPosition(uint256 _rate, uint256 _amountOfSwaps) internal {
    // TODO: Consider requesting _amountOfSwaps to be 2 or more, to avoid flash loans/mints
    uint256 _startingSwap = performedSwaps.add(1);
    uint256 _finalSwap = _startingSwap.add(_amountOfSwaps);
    swapAmountDelta[_startingSwap] += int256(_rate); // TODO: use SignedSafeMath
    swapAmountDelta[_finalSwap] -= int256(_rate); // TODO: use SignedSafeMath
    userTrades[msg.sender] = DCA(_rate, _startingSwap, _finalSwap);
  }

  function _removePosition() internal {
    DCA memory _userDCA = userTrades[msg.sender];
    if (_userDCA.lastSwap > performedSwaps) {
      swapAmountDelta[performedSwaps.add(1)] -= int256(_userDCA.rate); // TODO: use SignedSafeMath
      swapAmountDelta[_userDCA.lastSwap] += int256(_userDCA.rate); // TODO: use SignedSafeMath
    }
    delete userTrades[msg.sender];
  }

  /** Return the amount of tokens swapped in TO */
  function _calculateSwapped() internal returns (uint256 _swapped) {
    DCA memory _userDCA = userTrades[msg.sender];
    uint256[2] memory _sumRatesLastWidthraw = accumRatesPerUnit[_userDCA.lastWithdrawSwap];
    uint256[2] memory _sumRatesPerformed = accumRatesPerUnit[performedSwaps];
    _swapped = _sumRatesPerformed[1].sub(_sumRatesLastWidthraw[1]).mul(_userDCA.rate).mul(OVERFLOW_GUARD).add(
      _sumRatesPerformed[0].sub(_sumRatesLastWidthraw[0]).mul(_userDCA.rate)
    );
  }

  /** Returns how many FROM remains unswapped  */
  function _calculateUnswapped() internal returns (uint256 _unswapped) {
    DCA memory _userDCA = userTrades[msg.sender];
    if (_userDCA.lastSwap <= performedSwaps) {
      return 0;
    }
    uint256 _remainingSwaps = _userDCA.lastSwap - performedSwaps;
    _unswapped = _remainingSwaps.mul(_userDCA.rate);
  }
}

// TODO: withdrawAllSwappedAssets
