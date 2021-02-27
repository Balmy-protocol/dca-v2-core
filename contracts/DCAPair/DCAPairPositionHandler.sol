//SPDX-License-Identifier: Unlicense
pragma solidity 0.7.0;

import './DCAPairSwapHandler.sol';

interface IDCAPairPositionHandler {
  event Terminated(address indexed _depositor, uint256 _canceledDate, uint256 _startDate, uint256 _endDate, uint256 _amountPerDay);
  event Deposited(address indexed _depositor, uint256 _rate, uint256 _startingSwap, uint256 _lastSwap);

  function deposit(
    address _tokenAddress,
    uint256 _rate,
    uint256 _amountOfSwaps
  ) external;

  function withdrawSwapped(uint256 _dcaId) external returns (uint256 _swapped);

  function modifyRate(uint256 _dcaId, uint256 _newRate) external;

  function modifySwaps(uint256 _dcaId, uint256 _newSwaps) external;

  function modifyRateAndSwaps(
    uint256 _dcaId,
    uint256 _newRate,
    uint256 _newSwaps
  ) external;

  function terminate(uint256 _dcaId) external;
}

abstract contract DCAPairPositionHandler is DCAPairSwapHandler, IDCAPairPositionHandler {
  using SafeERC20 for IERC20Decimals;
  using SafeMath for uint256;
  using SignedSafeMath for int256;

  uint256 _totalDCAs = 0; // TODO: Replace for NFT hash

  function _deposit(
    address _tokenAddress,
    uint256 _rate,
    uint256 _amountOfSwaps
  ) internal {
    // TODO: Verify that the given token is actually tokenA or tokenB
    IERC20Decimals _from = _tokenAddress == address(tokenA) ? tokenA : tokenB;
    _from.safeTransferFrom(msg.sender, address(this), _rate.mul(_amountOfSwaps));
    _totalDCAs += 1; // => dcaId
    _addPosition(_totalDCAs, _tokenAddress, _rate, _amountOfSwaps);
    // emit Deposited(msg.sender, _rate, _startingSwap, _finalSwap); TODO: Emit event
  }

  function _withdrawSwapped(uint256 _dcaId) internal returns (uint256 _swapped) {
    // TODO: Check that the sender actually has a position set

    _swapped = _calculateSwapped(_dcaId);

    if (_swapped > 0) {
      // TODO: update userTrades
      IERC20Decimals _to = _getTo(_dcaId);
      _to.safeTransferFrom(address(this), msg.sender, _swapped);
    }

    // TODO: Emit event
  }

  function _terminate(uint256 _dcaId) internal {
    // TODO: Check that the sender actually has a position set

    uint256 _swapped = _calculateSwapped(_dcaId);
    uint256 _unswapped = _calculateUnswapped(_dcaId);

    _removePosition(_dcaId);

    if (_swapped > 0) {
      IERC20Decimals _to = _getTo(_dcaId);
      _to.safeTransferFrom(address(this), msg.sender, _swapped);
    }

    if (_unswapped > 0) {
      IERC20Decimals _from = _getFrom(_dcaId);
      _from.safeTransferFrom(address(this), msg.sender, _unswapped);
    }

    // TODO: Emit event
  }

  function _modifyRate(uint256 _dcaId, uint256 _newRate) internal {
    // TODO: Check that the sender actually has a position set

    DCA memory _userDCA = userTrades[_dcaId];

    // TODO: Check if the position is already completed. If it is, then fail

    uint256 _swapsLeft = _userDCA.lastSwap.sub(performedSwaps);
    _modifyRateAndSwaps(_dcaId, _newRate, _swapsLeft);
  }

  function _modifySwaps(uint256 _dcaId, uint256 _newSwaps) internal {
    // TODO: Check that the sender actually has a position set

    DCA memory _userDCA = userTrades[_dcaId];

    _modifyRateAndSwaps(_dcaId, _userDCA.rate, _newSwaps);
  }

  function _modifyRateAndSwaps(
    uint256 _dcaId,
    uint256 _newRate,
    uint256 _newAmountOfSwaps
  ) internal {
    // TODO: Check that the sender actually has a position set

    uint256 _unswapped = _calculateUnswapped(_dcaId);
    uint256 _totalNecessary = _newRate.mul(_newAmountOfSwaps);
    int256 _needed = int256(_totalNecessary - _unswapped);

    IERC20Decimals _from = _getFrom(_dcaId);

    _removePosition(_dcaId);
    _addPosition(_dcaId, address(_from), _newRate, _newAmountOfSwaps);

    if (_needed > 0) {
      // We need to ask for more funds
      _from.safeTransferFrom(msg.sender, address(this), uint256(_needed));
    } else if (_needed < 0) {
      // We need to return to the owner the amount that won't be used anymore
      _from.safeTransferFrom(address(this), msg.sender, uint256(-_needed));
    }
  }

  function _addPosition(
    uint256 _dcaId,
    address _from,
    uint256 _rate,
    uint256 _amountOfSwaps
  ) internal {
    // TODO: Consider requesting _amountOfSwaps to be 2 or more, to avoid flash loans/mints
    uint256 _startingSwap = performedSwaps.add(1);
    uint256 _finalSwap = _startingSwap.add(_amountOfSwaps);
    swapAmountDelta[_from][_startingSwap] += int256(_rate); // TODO: use SignedSafeMath
    swapAmountDelta[_from][_finalSwap] -= int256(_rate); // TODO: use SignedSafeMath
    userTrades[_dcaId] = DCA(_from, _rate, _startingSwap, _finalSwap);
  }

  function _removePosition(uint256 _dcaId) internal {
    DCA memory _userDCA = userTrades[_dcaId];
    if (_userDCA.lastSwap > performedSwaps) {
      swapAmountDelta[_userDCA.from][performedSwaps.add(1)] -= int256(_userDCA.rate); // TODO: use SignedSafeMath
      swapAmountDelta[_userDCA.from][_userDCA.lastSwap] += int256(_userDCA.rate); // TODO: use SignedSafeMath
    }
    delete userTrades[_dcaId];
  }

  /** Return the amount of tokens swapped in TO */
  function _calculateSwapped(uint256 _dcaId) internal returns (uint256 _swapped) {
    DCA memory _userDCA = userTrades[_dcaId];
    uint256[2] memory _sumRatesLastWidthraw = accumRatesPerUnit[_userDCA.from][_userDCA.lastWithdrawSwap];
    uint256[2] memory _sumRatesPerformed = accumRatesPerUnit[_userDCA.from][performedSwaps];
    _swapped = _sumRatesPerformed[1].sub(_sumRatesLastWidthraw[1]).mul(_userDCA.rate).mul(type(uint256).max).add(
      _sumRatesPerformed[0].sub(_sumRatesLastWidthraw[0]).mul(_userDCA.rate)
    );
  }

  /** Returns how many FROM remains unswapped  */
  function _calculateUnswapped(uint256 _dcaId) internal returns (uint256 _unswapped) {
    DCA memory _userDCA = userTrades[_dcaId];
    if (_userDCA.lastSwap <= performedSwaps) {
      return 0;
    }
    uint256 _remainingSwaps = _userDCA.lastSwap - performedSwaps;
    _unswapped = _remainingSwaps.mul(_userDCA.rate);
  }

  function _getFrom(uint256 _dcaId) internal returns (IERC20Decimals _from) {
    DCA memory _userDCA = userTrades[_dcaId];
    _from = _userDCA.from == address(tokenA) ? tokenA : tokenB;
  }

  function _getTo(uint256 _dcaId) internal returns (IERC20Decimals _to) {
    DCA memory _userDCA = userTrades[_dcaId];
    _to = _userDCA.from == address(tokenA) ? tokenB : tokenA;
  }
}

// TODO: withdrawAllSwappedAssets
