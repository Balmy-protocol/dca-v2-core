//SPDX-License-Identifier: Unlicense
pragma solidity 0.7.0;

import './DCAPairSwapHandler.sol';

interface IDCAPairPositionHandler {
  event Terminated(address indexed _user, uint256 _dcaId, uint256 _returnedUnswapped, uint256 _returnedSwapped);
  event Deposited(address indexed _user, uint256 _dcaId, address _fromToken, uint256 _rate, uint256 _startingSwap, uint256 _lastSwap);
  event Withdrew(address indexed _user, uint256 _dcaId, address _token, uint256 _amount);
  event Modified(address indexed _user, uint256 _dcaId, uint256 _rate, uint256 _startingSwap, uint256 _lastSwap);

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

  uint256 internal _totalDCAs = 0; // TODO: Replace for NFT hash

  function _deposit(
    address _tokenAddress,
    uint256 _rate,
    uint256 _amountOfSwaps
  ) internal returns (uint256 _dcaId) {
    require(_tokenAddress == address(tokenA) || _tokenAddress == address(tokenB), 'DCAPair: Invalid deposit address');
    IERC20Decimals _from = _tokenAddress == address(tokenA) ? tokenA : tokenB;
    _from.safeTransferFrom(msg.sender, address(this), _rate.mul(_amountOfSwaps));
    _totalDCAs += 1;
    _dcaId = _totalDCAs;
    (uint256 _startingSwap, uint256 _finalSwap) = _addPosition(_dcaId, _tokenAddress, _rate, _amountOfSwaps);
    emit Deposited(msg.sender, _dcaId, _tokenAddress, _rate, _startingSwap, _finalSwap);
  }

  function _withdrawSwapped(uint256 _dcaId) internal returns (uint256 _swapped) {
    _assertPositionExists(_dcaId);

    _swapped = _calculateSwapped(_dcaId);

    if (_swapped > 0) {
      userTrades[_dcaId].lastWithdrawSwap = performedSwaps;

      IERC20Decimals _to = _getTo(_dcaId);
      _to.safeTransfer(msg.sender, _swapped);

      emit Withdrew(msg.sender, _dcaId, address(_to), _swapped);
    }
  }

  function _terminate(uint256 _dcaId) internal {
    _assertPositionExists(_dcaId);

    uint256 _swapped = _calculateSwapped(_dcaId);
    uint256 _unswapped = _calculateUnswapped(_dcaId);

    IERC20Decimals _from = _getFrom(_dcaId);
    IERC20Decimals _to = _getTo(_dcaId);
    _removePosition(_dcaId);

    if (_swapped > 0) {
      _to.safeTransfer(msg.sender, _swapped);
    }

    if (_unswapped > 0) {
      _from.safeTransfer(msg.sender, _unswapped);
    }

    emit Terminated(msg.sender, _dcaId, _unswapped, _swapped);
  }

  function _modifyRate(uint256 _dcaId, uint256 _newRate) internal {
    _assertPositionExists(_dcaId);

    DCA memory _userDCA = userTrades[_dcaId];

    uint256 _swapsLeft = _userDCA.lastSwap.sub(performedSwaps);
    require(_swapsLeft > 0, 'DCAPair: You cannot modify only the rate of a position that has already been completed');

    _modifyRateAndSwaps(_dcaId, _newRate, _swapsLeft);
  }

  function _modifySwaps(uint256 _dcaId, uint256 _newSwaps) internal {
    _assertPositionExists(_dcaId);

    DCA memory _userDCA = userTrades[_dcaId];

    _modifyRateAndSwaps(_dcaId, _userDCA.rate, _newSwaps);
  }

  function _modifyRateAndSwaps(
    uint256 _dcaId,
    uint256 _newRate,
    uint256 _newAmountOfSwaps
  ) internal {
    _assertPositionExists(_dcaId);

    uint256 _unswapped = _calculateUnswapped(_dcaId);
    uint256 _totalNecessary = _newRate.mul(_newAmountOfSwaps);
    int256 _needed = int256(_totalNecessary - _unswapped);

    IERC20Decimals _from = _getFrom(_dcaId);

    _removePosition(_dcaId);
    (uint256 _startingSwap, uint256 _finalSwap) = _addPosition(_dcaId, address(_from), _newRate, _newAmountOfSwaps);

    if (_needed > 0) {
      // We need to ask for more funds
      _from.safeTransferFrom(msg.sender, address(this), uint256(_needed));
    } else if (_needed < 0) {
      // We need to return to the owner the amount that won't be used anymore
      _from.safeTransfer(msg.sender, uint256(-_needed));
    }

    emit Modified(msg.sender, _dcaId, _newRate, _startingSwap, _finalSwap);
  }

  function _assertPositionExists(uint256 _dcaId) internal view {
    require(userTrades[_dcaId].rate > 0, 'DCAPair: Invalid position id');
  }

  function _addPosition(
    uint256 _dcaId,
    address _from,
    uint256 _rate,
    uint256 _amountOfSwaps
  ) internal returns (uint256 _startingSwap, uint256 _finalSwap) {
    require(_rate > 0, 'DCAPair: Invalid rate. It must be positive');
    require(_amountOfSwaps > 0, 'DCAPair: Invalid amount of swaps. It must be positive');
    // TODO: Consider requesting _amountOfSwaps to be 2 or more, to avoid flash loans/mints
    _startingSwap = performedSwaps.add(1);
    _finalSwap = performedSwaps.add(_amountOfSwaps);
    swapAmountDelta[_from][_startingSwap] += int256(_rate); // TODO: use SignedSafeMath
    swapAmountDelta[_from][_finalSwap] -= int256(_rate); // TODO: use SignedSafeMath
    userTrades[_dcaId] = DCA(_from, _rate, performedSwaps, _finalSwap);
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
  function _calculateSwapped(uint256 _dcaId) internal view returns (uint256 _swapped) {
    DCA memory _userDCA = userTrades[_dcaId];
    uint256[2] memory _accumRatesLastWidthraw = accumRatesPerUnit[_userDCA.from][_userDCA.lastWithdrawSwap];
    uint256[2] memory _accumRatesPerformed = accumRatesPerUnit[_userDCA.from][performedSwaps];

    IERC20Decimals _from = _getFrom(_dcaId);
    uint256 _magnitude = 10**_from.decimals();

    /*
      P = performed
      L = last widthraw
      RATE_PER_UNIT = Amount TO tokens * magnitude(TO)
      RATE = Amount FROM tokens * magnitude(FROM)
      accumPerUnit(X) = RATE_PER_UNIT(X) + RATE_PER_UNIT(X - 1) + ... + RATE_PER_UNIT(1)

      swapped = (accumPerUnit(P) - accumPerUnit(L)) * RATE / magnitude(FROM)
      swapped = (multiplier(P) - multiplier(L) * MAX_UINT + accum(P) - accum(L)) * RATE / magnitude(FROM)
      swapped = (multiplier(P) - multiplier(L) * MAX_UINT / magnitude(FROM) + (accum(P) - accum(L)) / magnitude(FROM)) * RATE
      swapped = (multiplier(P) - multiplier(L) * (MAX_UINT / magnitude(FROM)) + (accum(P) - accum(L)) / magnitude(FROM)) * RATE
    */

    uint256 _multiplierDifference = _accumRatesPerformed[1].sub(_accumRatesLastWidthraw[1]);
    uint256 _multiplier = type(uint256).max.div(_magnitude);
    int256 _accumTerm = int256(_accumRatesPerformed[0] - _accumRatesLastWidthraw[0]) / int256(_magnitude); // TODO: use SignedSafeMath
    _swapped = uint256(int256(_multiplierDifference.mul(_multiplier)) + _accumTerm).mul(_userDCA.rate);
  }

  // Multiplier diff es 1, y accum es 0
  // Multiplier diff es 0, y accum es MAX
  // Accum diff es negativo
  // Multiplier diff es 2, se puede dar sin overflow?

  /** Returns how many FROM remains unswapped  */
  function _calculateUnswapped(uint256 _dcaId) internal view returns (uint256 _unswapped) {
    DCA memory _userDCA = userTrades[_dcaId];
    if (_userDCA.lastSwap <= performedSwaps) {
      return 0;
    }
    uint256 _remainingSwaps = _userDCA.lastSwap - performedSwaps;
    _unswapped = _remainingSwaps.mul(_userDCA.rate);
  }

  function _getFrom(uint256 _dcaId) internal view returns (IERC20Decimals _from) {
    DCA memory _userDCA = userTrades[_dcaId];
    _from = _userDCA.from == address(tokenA) ? tokenA : tokenB;
  }

  function _getTo(uint256 _dcaId) internal view returns (IERC20Decimals _to) {
    DCA memory _userDCA = userTrades[_dcaId];
    _to = _userDCA.from == address(tokenA) ? tokenB : tokenA;
  }
}

// TODO: withdrawAllSwappedAssets
