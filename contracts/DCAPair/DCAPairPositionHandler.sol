// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.4;

import '@openzeppelin/contracts/token/ERC721/ERC721.sol';
import '@openzeppelin/contracts/security/ReentrancyGuard.sol';

import './DCAPairParameters.sol';

abstract contract DCAPairPositionHandler is ReentrancyGuard, DCAPairParameters, IDCAPairPositionHandler, ERC721 {
  using SafeERC20 for IERC20Detailed;

  mapping(uint256 => DCA) internal _userPositions;
  uint256 internal _idCounter = 0;

  constructor(IERC20Detailed _tokenA, IERC20Detailed _tokenB)
    ERC721(string(abi.encodePacked('DCA: ', _tokenA.symbol(), ' - ', _tokenB.symbol())), 'DCA')
  {}

  function userPosition(uint256 _dcaId)
    public
    view
    override
    returns (
      IERC20Detailed _from,
      IERC20Detailed _to,
      uint32 _swapInterval,
      uint32 _swapsExecuted,
      uint256 _swapped,
      uint32 _swapsLeft,
      uint256 _remaining,
      uint192 _rate
    )
  {
    DCA memory position = _userPositions[_dcaId];
    _from = position.fromTokenA ? tokenA : tokenB;
    _to = position.fromTokenA ? tokenB : tokenA;
    _swapInterval = position.swapInterval;
    _swapsExecuted = position.lastWithdrawSwap > 0 ? performedSwaps[_swapInterval] - position.lastWithdrawSwap : 0;
    _swapped = _calculateSwapped(_dcaId);
    _swapsLeft = position.lastSwap > performedSwaps[_swapInterval] ? position.lastSwap - performedSwaps[_swapInterval] : 0;
    _remaining = _calculateUnswapped(_dcaId);
    _rate = position.rate;
  }

  function deposit(
    address _tokenAddress,
    uint192 _rate,
    uint32 _amountOfSwaps,
    uint32 _swapInterval
  ) public override nonReentrant returns (uint256) {
    require(_tokenAddress == address(tokenA) || _tokenAddress == address(tokenB), 'DCAPair: invalid deposit address');
    require(globalParameters.isSwapIntervalAllowed(_swapInterval), 'DCAPair: interval not allowed');
    IERC20Detailed _from = _tokenAddress == address(tokenA) ? tokenA : tokenB;
    uint256 _amount = _rate * _amountOfSwaps;
    _from.safeTransferFrom(msg.sender, address(this), _amount);
    _balances[_tokenAddress] += _amount;
    _idCounter += 1;
    _safeMint(msg.sender, _idCounter);
    (uint32 _startingSwap, uint32 _finalSwap) = _addPosition(_idCounter, _tokenAddress, _rate, _amountOfSwaps, 0, _swapInterval);
    emit Deposited(msg.sender, _idCounter, _tokenAddress, _rate, _startingSwap, _swapInterval, _finalSwap);
    return _idCounter;
  }

  function withdrawSwapped(uint256 _dcaId) public override nonReentrant returns (uint256 _swapped) {
    _assertPositionExistsAndCanBeOperatedByCaller(_dcaId);

    _swapped = _calculateSwapped(_dcaId);

    _userPositions[_dcaId].lastWithdrawSwap = performedSwaps[_userPositions[_dcaId].swapInterval];
    _userPositions[_dcaId].swappedBeforeModified = 0;

    IERC20Detailed _to = _getTo(_dcaId);
    _balances[address(_to)] -= _swapped;
    _to.safeTransfer(msg.sender, _swapped);

    emit Withdrew(msg.sender, _dcaId, address(_to), _swapped);
  }

  function withdrawSwappedMany(uint256[] calldata _dcaIds)
    public
    override
    nonReentrant
    returns (uint256 _swappedTokenA, uint256 _swappedTokenB)
  {
    for (uint256 i = 0; i < _dcaIds.length; i++) {
      uint256 _dcaId = _dcaIds[i];
      _assertPositionExistsAndCanBeOperatedByCaller(_dcaId);
      uint256 _swappedDCA = _calculateSwapped(_dcaId);
      if (_userPositions[_dcaId].fromTokenA) {
        _swappedTokenB += _swappedDCA;
      } else {
        _swappedTokenA += _swappedDCA;
      }
      _userPositions[_dcaId].lastWithdrawSwap = performedSwaps[_userPositions[_dcaId].swapInterval];
      _userPositions[_dcaId].swappedBeforeModified = 0;
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

  function terminate(uint256 _dcaId) public override nonReentrant {
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

  function modifyRate(uint256 _dcaId, uint192 _newRate) public override nonReentrant {
    _assertPositionExistsAndCanBeOperatedByCaller(_dcaId);

    DCA memory _userDCA = _userPositions[_dcaId];

    uint32 _swapsLeft = _userDCA.lastSwap - performedSwaps[_userDCA.swapInterval];
    require(_swapsLeft > 0, 'DCAPair: position completed');

    _modifyRateAndSwaps(_dcaId, _newRate, _swapsLeft);
  }

  function modifySwaps(uint256 _dcaId, uint32 _newSwaps) public override nonReentrant {
    _assertPositionExistsAndCanBeOperatedByCaller(_dcaId);

    _modifyRateAndSwaps(_dcaId, _userPositions[_dcaId].rate, _newSwaps);
  }

  function modifyRateAndSwaps(
    uint256 _dcaId,
    uint192 _newRate,
    uint32 _newAmountOfSwaps
  ) public override nonReentrant {
    _assertPositionExistsAndCanBeOperatedByCaller(_dcaId);

    _modifyRateAndSwaps(_dcaId, _newRate, _newAmountOfSwaps);
  }

  function addFundsToPosition(
    uint256 _dcaId,
    uint256 _amount,
    uint32 _newSwaps
  ) public override nonReentrant {
    _assertPositionExistsAndCanBeOperatedByCaller(_dcaId);
    require(_amount > 0, 'DCAPair: non-positive amount');

    uint256 _unswapped = _calculateUnswapped(_dcaId);
    uint256 _total = _unswapped + _amount;

    _modifyPosition(_dcaId, _total, _unswapped, uint192(_total / _newSwaps), _newSwaps);
  }

  /** Helper function to modify a position */
  function _modifyRateAndSwaps(
    uint256 _dcaId,
    uint192 _newRate,
    uint32 _newAmountOfSwaps
  ) internal {
    uint256 _unswapped = _calculateUnswapped(_dcaId);
    uint256 _totalNecessary = _newRate * _newAmountOfSwaps;

    _modifyPosition(_dcaId, _totalNecessary, _unswapped, _newRate, _newAmountOfSwaps);
  }

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

    uint32 _swapInterval = _userPositions[_dcaId].swapInterval;
    _removePosition(_dcaId);
    (uint32 _startingSwap, uint32 _finalSwap) =
      _addPosition(_dcaId, address(_from), _newRate, _newAmountOfSwaps, uint248(_swapped), _swapInterval);

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
    require(_userPositions[_dcaId].rate > 0, 'DCAPair: invalid position id');
    require(_isApprovedOrOwner(msg.sender, _dcaId), 'DCAPair: caller not allowed');
  }

  function _addPosition(
    uint256 _dcaId,
    address _from,
    uint192 _rate,
    uint32 _amountOfSwaps,
    uint248 _swappedBeforeModified,
    uint32 _swapInterval
  ) internal returns (uint32 _startingSwap, uint32 _finalSwap) {
    require(_rate > 0, 'DCAPair: non-positive rate');
    require(_amountOfSwaps > 0, 'DCAPair: non-positive amount');
    uint32 _performedSwaps = performedSwaps[_swapInterval];
    _startingSwap = _performedSwaps + 1;
    _finalSwap = _performedSwaps + _amountOfSwaps;
    swapAmountDelta[_swapInterval][_from][_startingSwap] += int192(_rate);
    swapAmountDelta[_swapInterval][_from][_finalSwap] -= int192(_rate);
    _userPositions[_dcaId] = DCA(_performedSwaps, _finalSwap, _swapInterval, _rate, _from == address(tokenA), _swappedBeforeModified);
  }

  function _removePosition(uint256 _dcaId) internal {
    DCA memory _userDCA = _userPositions[_dcaId];
    if (_userDCA.lastSwap > performedSwaps[_userDCA.swapInterval]) {
      address _from = _userDCA.fromTokenA ? address(tokenA) : address(tokenB);
      swapAmountDelta[_userDCA.swapInterval][_from][performedSwaps[_userDCA.swapInterval] + 1] -= int192(_userDCA.rate);
      swapAmountDelta[_userDCA.swapInterval][_from][_userDCA.lastSwap] += int192(_userDCA.rate);
    }
    delete _userPositions[_dcaId];
  }

  /** Return the amount of tokens swapped in TO */
  function _calculateSwapped(uint256 _dcaId) internal view returns (uint256 _swapped) {
    _swapped = _calculateSwapped(_dcaId, true);
  }

  function _calculateSwapped(uint256 _dcaId, bool _applyFee) internal view returns (uint256 _swapped) {
    DCA memory _userDCA = _userPositions[_dcaId];
    address _from = _userDCA.fromTokenA ? address(tokenA) : address(tokenB);
    uint256 _accumRatesLastWidthraw = _accumRatesPerUnit[_userDCA.swapInterval][_from][_userDCA.lastWithdrawSwap];
    uint256 _accumRatesLastSwap =
      _accumRatesPerUnit[_userDCA.swapInterval][_from][
        performedSwaps[_userDCA.swapInterval] < _userDCA.lastSwap ? performedSwaps[_userDCA.swapInterval] : _userDCA.lastSwap
      ];

    uint256 _accumPerUnit = _accumRatesLastSwap - _accumRatesLastWidthraw;
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
    DCA memory _userDCA = _userPositions[_dcaId];
    if (_userDCA.lastSwap <= performedSwaps[_userDCA.swapInterval]) {
      return 0;
    }
    uint32 _remainingSwaps = _userDCA.lastSwap - performedSwaps[_userDCA.swapInterval];
    _unswapped = _remainingSwaps * _userDCA.rate;
  }

  function _getFrom(uint256 _dcaId) internal view returns (IERC20Detailed _from) {
    DCA memory _userDCA = _userPositions[_dcaId];
    _from = _userDCA.fromTokenA ? tokenA : tokenB;
  }

  function _getTo(uint256 _dcaId) internal view returns (IERC20Detailed _to) {
    DCA memory _userDCA = _userPositions[_dcaId];
    _to = _userDCA.fromTokenA ? tokenB : tokenA;
  }
}
