// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

import './DCAPairParameters.sol';
import './ERC721/ERC721.sol';
import '../utils/Math.sol';

abstract contract DCAPairPositionHandler is DCAPairParameters, IDCAPairPositionHandler, ERC721 {
  using SafeERC20 for IERC20Detailed;

  uint256 internal _idCounter = 0;

  constructor(IERC20Detailed _tokenA, IERC20Detailed _tokenB)
    ERC721(string(abi.encodePacked('DCA: ', _tokenA.symbol(), ' - ', _tokenB.symbol())), 'DCA')
  {}

  function deposit(
    address _tokenAddress,
    uint192 _rate,
    uint32 _amountOfSwaps
  ) public override returns (uint256) {
    require(_tokenAddress == address(tokenA) || _tokenAddress == address(tokenB), 'DCAPair: invalid deposit address');
    IERC20Detailed _from = _tokenAddress == address(tokenA) ? tokenA : tokenB;
    uint256 _amount = _rate * _amountOfSwaps;
    _from.safeTransferFrom(msg.sender, address(this), _amount);
    _balances[_tokenAddress] += _amount;
    _idCounter += 1;
    _safeMint(msg.sender, _idCounter);
    (uint32 _startingSwap, uint32 _finalSwap) = _addPosition(_idCounter, _tokenAddress, _rate, _amountOfSwaps, 0);
    emit Deposited(msg.sender, _idCounter, _tokenAddress, _rate, _startingSwap, _finalSwap);
    return _idCounter;
  }

  function withdrawSwapped(uint256 _dcaId) public override returns (uint256 _swapped) {
    _assertPositionExistsAndCanBeOperatedByCaller(_dcaId);

    _swapped = _calculateSwapped(_dcaId);

    userPositions[_dcaId].lastWithdrawSwap = performedSwaps;
    userPositions[_dcaId].swappedBeforeModified = 0;

    IERC20Detailed _to = _getTo(_dcaId);
    _balances[address(_to)] -= _swapped;
    _to.safeTransfer(msg.sender, _swapped);

    emit Withdrew(msg.sender, _dcaId, address(_to), _swapped);
  }

  function withdrawSwappedMany(uint256[] calldata _dcaIds) public override returns (uint256 _swappedTokenA, uint256 _swappedTokenB) {
    for (uint256 i = 0; i < _dcaIds.length; i++) {
      uint256 _dcaId = _dcaIds[i];
      _assertPositionExistsAndCanBeOperatedByCaller(_dcaId);
      uint256 _swappedDCA = _calculateSwapped(_dcaId);
      if (userPositions[_dcaId].fromTokenA) {
        _swappedTokenB += _swappedDCA;
      } else {
        _swappedTokenA += _swappedDCA;
      }
      userPositions[_dcaId].lastWithdrawSwap = performedSwaps;
      userPositions[_dcaId].swappedBeforeModified = 0;
    }

    if (_swappedTokenA > 0) {
      _balances[address(tokenA)] -= _swappedTokenA;
      tokenA.safeTransfer(msg.sender, _swappedTokenA);
    }

    if (_swappedTokenB > 0) {
      _balances[address(tokenB)] -= _swappedTokenB;
      tokenB.safeTransfer(msg.sender, _swappedTokenB);
    }
    emit WithdrewMany(msg.sender, _dcaIds, _swappedTokenA, _swappedTokenB);
  }

  function terminate(uint256 _dcaId) public override {
    _assertPositionExistsAndCanBeOperatedByCaller(_dcaId);

    uint256 _swapped = _calculateSwapped(_dcaId);
    uint256 _unswapped = _calculateUnswapped(_dcaId);

    IERC20Detailed _from = _getFrom(_dcaId);
    IERC20Detailed _to = _getTo(_dcaId);
    _removePosition(_dcaId);
    _burn(_dcaId);

    if (_swapped > 0) {
      _balances[address(_to)] -= _swapped;
      _to.safeTransfer(msg.sender, _swapped);
    }

    if (_unswapped > 0) {
      _balances[address(_from)] -= _unswapped;
      _from.safeTransfer(msg.sender, _unswapped);
    }

    emit Terminated(msg.sender, _dcaId, _unswapped, _swapped);
  }

  function modifyRate(uint256 _dcaId, uint192 _newRate) public override {
    _assertPositionExistsAndCanBeOperatedByCaller(_dcaId);

    uint32 _swapsLeft = userPositions[_dcaId].lastSwap - performedSwaps;
    require(_swapsLeft > 0, 'DCAPair: position completed');

    modifyRateAndSwaps(_dcaId, _newRate, _swapsLeft);
  }

  function modifySwaps(uint256 _dcaId, uint32 _newSwaps) public override {
    _assertPositionExistsAndCanBeOperatedByCaller(_dcaId);

    modifyRateAndSwaps(_dcaId, userPositions[_dcaId].rate, _newSwaps);
  }

  function modifyRateAndSwaps(
    uint256 _dcaId,
    uint192 _newRate,
    uint32 _newAmountOfSwaps
  ) public override {
    _assertPositionExistsAndCanBeOperatedByCaller(_dcaId);

    uint256 _unswapped = _calculateUnswapped(_dcaId);
    uint256 _totalNecessary = _newRate * _newAmountOfSwaps;

    _modifyPosition(_dcaId, _totalNecessary, _unswapped, _newRate, _newAmountOfSwaps);
  }

  function addFundsToPosition(
    uint256 _dcaId,
    uint256 _amount,
    uint32 _newSwaps
  ) public override {
    _assertPositionExistsAndCanBeOperatedByCaller(_dcaId);
    require(_amount > 0, 'DCAPair: non-positive amount');

    uint256 _unswapped = _calculateUnswapped(_dcaId);
    uint256 _total = _unswapped + _amount;

    _modifyPosition(_dcaId, _total, _unswapped, uint192(_total / _newSwaps), _newSwaps);
  }

  /** Helper function to modify a position */
  function _modifyPosition(
    uint256 _dcaId,
    uint256 _totalNecessary,
    uint256 _unswapped,
    uint192 _newRate,
    uint32 _newAmountOfSwaps
  ) internal {
    IERC20Detailed _from = _getFrom(_dcaId);

    // We will store the swapped amount without the fee. The fee will be applied during withdraw/terminate
    uint256 _swapped = _calculateSwapped(_dcaId, false);
    require(_swapped <= type(uint248).max, 'DCAPair: must withdraw before'); // You should withdraw before modifying, to avoid loosing funds

    _removePosition(_dcaId);
    (uint32 _startingSwap, uint32 _finalSwap) = _addPosition(_dcaId, address(_from), _newRate, _newAmountOfSwaps, uint248(_swapped));

    if (_totalNecessary > _unswapped) {
      // We need to ask for more funds
      _from.safeTransferFrom(msg.sender, address(this), _totalNecessary - _unswapped);
      _balances[address(_from)] += _totalNecessary - _unswapped;
    } else if (_totalNecessary < _unswapped) {
      // We need to return to the owner the amount that won't be used anymore
      _balances[address(_from)] -= _unswapped - _totalNecessary;
      _from.safeTransfer(msg.sender, _unswapped - _totalNecessary);
    }

    emit Modified(msg.sender, _dcaId, _newRate, _startingSwap, _finalSwap);
  }

  function _assertPositionExistsAndCanBeOperatedByCaller(uint256 _dcaId) internal view {
    require(userPositions[_dcaId].rate > 0, 'DCAPair: invalid position id');
    require(_isApprovedOrOwner(msg.sender, _dcaId), 'DCAPair: caller not allowed');
  }

  function _addPosition(
    uint256 _dcaId,
    address _from,
    uint192 _rate,
    uint32 _amountOfSwaps,
    uint248 _swappedBeforeModified
  ) internal returns (uint32 _startingSwap, uint32 _finalSwap) {
    require(_rate > 0, 'DCAPair: non-positive rate');
    require(_amountOfSwaps > 0, 'DCAPair: non-positive amount');
    _startingSwap = performedSwaps + 1;
    _finalSwap = performedSwaps + _amountOfSwaps;
    swapAmountDelta[_from][_startingSwap] += int192(_rate);
    swapAmountDelta[_from][_finalSwap] -= int192(_rate);
    userPositions[_dcaId] = DCA(performedSwaps, _finalSwap, _rate, _from == address(tokenA), _swappedBeforeModified);
  }

  function _removePosition(uint256 _dcaId) internal {
    DCA memory _userDCA = userPositions[_dcaId];
    if (_userDCA.lastSwap > performedSwaps) {
      address _from = _userDCA.fromTokenA ? address(tokenA) : address(tokenB);
      swapAmountDelta[_from][performedSwaps + 1] -= int192(_userDCA.rate);
      swapAmountDelta[_from][_userDCA.lastSwap] += int192(_userDCA.rate);
    }
    delete userPositions[_dcaId];
  }

  /** Return the amount of tokens swapped in TO */
  function _calculateSwapped(uint256 _dcaId) internal view returns (uint256 _swapped) {
    _swapped = _calculateSwapped(_dcaId, true);
  }

  function _calculateSwapped(uint256 _dcaId, bool _applyFee) internal view returns (uint256 _swapped) {
    DCA memory _userDCA = userPositions[_dcaId];
    address _from = _userDCA.fromTokenA ? address(tokenA) : address(tokenB);
    uint256[2] memory _accumRatesLastWidthraw = _accumRatesPerUnit[_from][_userDCA.lastWithdrawSwap];
    uint256[2] memory _accumRatesLastSwap = _accumRatesPerUnit[_from][performedSwaps < _userDCA.lastSwap ? performedSwaps : _userDCA.lastSwap];

    /*
      LS = last swap = min(performed swaps, position.finalSwap)
      LW = last widthraw
      RATE_PER_UNIT(swap) = TO tokens for one unit of FROM = amount TO tokens * magnitude(TO)
      RATE(position) = amount FROM tokens * magnitude(FROM)
      accumPerUnit(swap) = RATE_PER_UNIT(swap) + RATE_PER_UNIT(swap - 1) + ... + RATE_PER_UNIT(1)

      swapped = (accumPerUnit(LS) - accumPerUnit(LW)) * RATE / magnitude(FROM)
      swapped = ((multiplier(LS) - multiplier(LW)) * MAX_UINT + accum(LS) - accum(LW)) * RATE / magnitude(FROM)
    */

    uint256 _multiplierDifference = _accumRatesLastSwap[1] - _accumRatesLastWidthraw[1];
    uint256 _accumPerUnit;
    if (_multiplierDifference == 2) {
      // If multiplier difference is 2, then the only way it won't overflow is if accum(LS) - accum(LW) == -max(uint256).
      // This line will revert for all other scenarios
      _accumPerUnit = type(uint256).max - (_accumRatesLastWidthraw[0] - _accumRatesLastSwap[0]) + type(uint256).max;
    } else {
      uint256 _multiplierTerm = _multiplierDifference * type(uint256).max;
      if (_accumRatesLastSwap[0] >= _accumRatesLastWidthraw[0]) {
        _accumPerUnit = _multiplierTerm + (_accumRatesLastSwap[0] - _accumRatesLastWidthraw[0]);
      } else {
        _accumPerUnit = _multiplierTerm - (_accumRatesLastWidthraw[0] - _accumRatesLastSwap[0]);
      }
    }

    uint256 _magnitude = _userDCA.fromTokenA ? _magnitudeA : _magnitudeB;
    (bool _ok, uint256 _mult) = Math.tryMul(_accumPerUnit, _userDCA.rate);
    uint256 _swappedInCurrentPosition;
    if (_ok) {
      _swappedInCurrentPosition = _mult / _magnitude;
    } else {
      // Since we can't multiply accum and rate because of overflows, we need to figure out which to divide
      // We don't want to divide a term that is smaller than magnitude, because it would go to 0.
      // And if neither are smaller than magnitude, then we will choose the one that loses less information, and that would be the one with smallest reminder
      bool _divideAccumFirst =
        _userDCA.rate < _magnitude || (_accumPerUnit > _magnitude && _accumPerUnit % _magnitude < _userDCA.rate % _magnitude);
      _swappedInCurrentPosition = _divideAccumFirst
        ? (_accumPerUnit / _magnitude) * _userDCA.rate
        : (_userDCA.rate / _magnitude) * _accumPerUnit;
    }

    uint256 _actuallySwapped = _swappedInCurrentPosition + _userDCA.swappedBeforeModified;
    if (_applyFee) {
      _swapped = _actuallySwapped - _getFeeFromAmount(globalParameters.swapFee(), _actuallySwapped);
    } else {
      _swapped = _actuallySwapped;
    }
  }

  /** Returns how many FROM remains unswapped  */
  function _calculateUnswapped(uint256 _dcaId) internal view returns (uint256 _unswapped) {
    DCA memory _userDCA = userPositions[_dcaId];
    if (_userDCA.lastSwap <= performedSwaps) {
      return 0;
    }
    uint32 _remainingSwaps = _userDCA.lastSwap - performedSwaps;
    _unswapped = _remainingSwaps * _userDCA.rate;
  }

  function _getFrom(uint256 _dcaId) internal view returns (IERC20Detailed _from) {
    DCA memory _userDCA = userPositions[_dcaId];
    _from = _userDCA.fromTokenA ? tokenA : tokenB;
  }

  function _getTo(uint256 _dcaId) internal view returns (IERC20Detailed _to) {
    DCA memory _userDCA = userPositions[_dcaId];
    _to = _userDCA.fromTokenA ? tokenB : tokenA;
  }
}
