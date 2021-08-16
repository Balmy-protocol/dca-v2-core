// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.6;

import '@openzeppelin/contracts/token/ERC721/ERC721.sol';
import '@openzeppelin/contracts/security/ReentrancyGuard.sol';

import './DCAPairParameters.sol';

abstract contract DCAPairPositionHandler is ReentrancyGuard, DCAPairParameters, IDCAPairPositionHandler, ERC721 {
  struct DCA {
    uint32 lastWithdrawSwap;
    uint32 lastSwap;
    uint32 swapInterval;
    uint160 rate;
    bool fromTokenA;
    uint248 swappedBeforeModified;
  }

  using SafeERC20 for IERC20Metadata;
  using EnumerableSet for EnumerableSet.UintSet;

  mapping(uint256 => DCA) internal _userPositions;
  uint256 internal _idCounter;

  constructor(IERC20Metadata _tokenA, IERC20Metadata _tokenB)
    ERC721(string(abi.encodePacked('DCA: ', _tokenA.symbol(), ' - ', _tokenB.symbol())), 'DCA')
  {}

  function userPosition(uint256 _dcaId) external view override returns (UserPosition memory _userPosition) {
    DCA memory _position = _userPositions[_dcaId];
    _userPosition.from = _position.fromTokenA ? tokenA : tokenB;
    _userPosition.to = _position.fromTokenA ? tokenB : tokenA;
    _userPosition.swapInterval = _position.swapInterval;
    _userPosition.swapsExecuted = _position.swapInterval > 0 ? performedSwaps[_position.swapInterval] - _position.lastWithdrawSwap : 0;
    _userPosition.swapped = _calculateSwapped(_dcaId);
    _userPosition.swapsLeft = _position.lastSwap > performedSwaps[_position.swapInterval]
      ? _position.lastSwap - performedSwaps[_position.swapInterval]
      : 0;
    _userPosition.remaining = _calculateUnswapped(_dcaId);
    _userPosition.rate = _position.rate;
  }

  function deposit(
    address _tokenAddress,
    uint160 _rate,
    uint32 _amountOfSwaps,
    uint32 _swapInterval
  ) external override nonReentrant returns (uint256) {
    if (_tokenAddress != address(tokenA) && _tokenAddress != address(tokenB)) revert InvalidToken();
    if (_amountOfSwaps == 0) revert ZeroSwaps();
    if (!_activeSwapIntervals.contains(_swapInterval) && !globalParameters.isSwapIntervalAllowed(_swapInterval)) revert InvalidInterval();
    IERC20Metadata _from = _tokenAddress == address(tokenA) ? tokenA : tokenB;
    uint256 _amount = _rate * _amountOfSwaps;
    _from.safeTransferFrom(msg.sender, address(this), _amount);
    _balances[_tokenAddress] += _amount;
    _idCounter += 1;
    _safeMint(msg.sender, _idCounter);
    _activeSwapIntervals.add(_swapInterval);
    (uint32 _startingSwap, uint32 _lastSwap) = _addPosition(_idCounter, _tokenAddress, _rate, _amountOfSwaps, 0, _swapInterval);
    emit Deposited(msg.sender, _idCounter, _tokenAddress, _rate, _startingSwap, _swapInterval, _lastSwap);
    return _idCounter;
  }

  function withdrawSwapped(uint256 _dcaId) external override nonReentrant returns (uint256 _swapped) {
    _assertPositionExistsAndCanBeOperatedByCaller(_dcaId);

    _swapped = _calculateSwapped(_dcaId);

    _userPositions[_dcaId].lastWithdrawSwap = performedSwaps[_userPositions[_dcaId].swapInterval];
    _userPositions[_dcaId].swappedBeforeModified = 0;

    IERC20Metadata _to = _getTo(_dcaId);
    _balances[address(_to)] -= _swapped;
    _to.safeTransfer(msg.sender, _swapped);

    emit Withdrew(msg.sender, _dcaId, address(_to), _swapped);
  }

  function withdrawSwappedMany(uint256[] calldata _dcaIds)
    external
    override
    nonReentrant
    returns (uint256 _swappedTokenA, uint256 _swappedTokenB)
  {
    for (uint256 i; i < _dcaIds.length; i++) {
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

  function terminate(uint256 _dcaId) external override nonReentrant {
    _assertPositionExistsAndCanBeOperatedByCaller(_dcaId);

    uint256 _swapped = _calculateSwapped(_dcaId);
    uint256 _unswapped = _calculateUnswapped(_dcaId);

    IERC20Metadata _from = _getFrom(_dcaId);
    IERC20Metadata _to = _getTo(_dcaId);
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

  function modifyRate(uint256 _dcaId, uint160 _newRate) external override nonReentrant {
    _assertPositionExistsAndCanBeOperatedByCaller(_dcaId);
    uint32 _swapsLeft = _userPositions[_dcaId].lastSwap - performedSwaps[_userPositions[_dcaId].swapInterval];
    if (_swapsLeft == 0) revert PositionCompleted();

    _modifyRateAndSwaps(_dcaId, _newRate, _swapsLeft);
  }

  function modifySwaps(uint256 _dcaId, uint32 _newSwaps) external override nonReentrant {
    _modifyRateAndSwaps(_dcaId, _userPositions[_dcaId].rate, _newSwaps);
  }

  function modifyRateAndSwaps(
    uint256 _dcaId,
    uint160 _newRate,
    uint32 _newAmountOfSwaps
  ) external override nonReentrant {
    _modifyRateAndSwaps(_dcaId, _newRate, _newAmountOfSwaps);
  }

  function addFundsToPosition(
    uint256 _dcaId,
    uint256 _amount,
    uint32 _newSwaps
  ) external override nonReentrant {
    if (_amount == 0) revert ZeroAmount();
    if (_newSwaps == 0) revert ZeroSwaps();

    uint256 _unswapped = _calculateUnswapped(_dcaId);
    uint256 _total = _unswapped + _amount;

    _modifyPosition(_dcaId, _total, _unswapped, uint160(_total / _newSwaps), _newSwaps);
  }

  function tokenURI(uint256 tokenId) public view override returns (string memory) {
    return globalParameters.nftDescriptor().tokenURI(this, tokenId);
  }

  /** Helper function to modify a position */
  function _modifyRateAndSwaps(
    uint256 _dcaId,
    uint160 _newRate,
    uint32 _newAmountOfSwaps
  ) internal {
    _modifyPosition(_dcaId, _newRate * _newAmountOfSwaps, _calculateUnswapped(_dcaId), _newRate, _newAmountOfSwaps);
  }

  function _modifyPosition(
    uint256 _dcaId,
    uint256 _totalNecessary,
    uint256 _unswapped,
    uint160 _newRate,
    uint32 _newAmountOfSwaps
  ) internal {
    _assertPositionExistsAndCanBeOperatedByCaller(_dcaId);
    IERC20Metadata _from = _getFrom(_dcaId);

    uint256 _swapped = _calculateSwapped(_dcaId);
    if (_swapped > type(uint248).max) revert MandatoryWithdraw(); // You should withdraw before modifying, to avoid losing funds

    uint32 _swapInterval = _userPositions[_dcaId].swapInterval;
    _removePosition(_dcaId);
    (uint32 _startingSwap, uint32 _lastSwap) = _addPosition(
      _dcaId,
      address(_from),
      _newRate,
      _newAmountOfSwaps,
      uint248(_swapped),
      _swapInterval
    );

    if (_totalNecessary > _unswapped) {
      // We need to ask for more funds
      _from.safeTransferFrom(msg.sender, address(this), _totalNecessary - _unswapped);
      _balances[address(_from)] += _totalNecessary - _unswapped;
    } else if (_totalNecessary < _unswapped) {
      // We need to return to the owner the amount that won't be used anymore
      _balances[address(_from)] -= _unswapped - _totalNecessary;
      _from.safeTransfer(msg.sender, _unswapped - _totalNecessary);
    }

    emit Modified(msg.sender, _dcaId, _newRate, _startingSwap, _lastSwap);
  }

  function _assertPositionExistsAndCanBeOperatedByCaller(uint256 _dcaId) internal view {
    if (_userPositions[_dcaId].rate == 0) revert InvalidPosition();
    if (!_isApprovedOrOwner(msg.sender, _dcaId)) revert UnauthorizedCaller();
  }

  function _addPosition(
    uint256 _dcaId,
    address _from,
    uint160 _rate,
    uint32 _amountOfSwaps,
    uint248 _swappedBeforeModified,
    uint32 _swapInterval
  ) internal returns (uint32 _startingSwap, uint32 _lastSwap) {
    if (_rate == 0) revert ZeroRate();
    uint32 _performedSwaps = performedSwaps[_swapInterval];
    _startingSwap = _performedSwaps + 1;
    _lastSwap = _performedSwaps + _amountOfSwaps;
    swapAmountDelta[_swapInterval][_from][_startingSwap] += int160(_rate);
    swapAmountDelta[_swapInterval][_from][_lastSwap + 1] -= int160(_rate);
    _userPositions[_dcaId] = DCA(_performedSwaps, _lastSwap, _swapInterval, _rate, _from == address(tokenA), _swappedBeforeModified);
  }

  function _removePosition(uint256 _dcaId) internal {
    uint32 _swapInterval = _userPositions[_dcaId].swapInterval;
    uint32 _lastSwap = _userPositions[_dcaId].lastSwap;
    uint32 _performedSwaps = performedSwaps[_swapInterval];

    if (_lastSwap > _performedSwaps) {
      int160 _rate = int160(_userPositions[_dcaId].rate);
      address _from = address(_getFrom(_dcaId));
      swapAmountDelta[_swapInterval][_from][_performedSwaps + 1] -= _rate;
      swapAmountDelta[_swapInterval][_from][_lastSwap + 1] += _rate;
    }
    delete _userPositions[_dcaId];
  }

  /** Returns the amount of tokens swapped in TO */
  function _calculateSwapped(uint256 _dcaId) internal view returns (uint256 _swapped) {
    DCA memory _userDCA = _userPositions[_dcaId];
    address _from = _userDCA.fromTokenA ? address(tokenA) : address(tokenB);
    uint256 _accumRatesLastSwap = _accumRatesPerUnit[_userDCA.swapInterval][_from][
      performedSwaps[_userDCA.swapInterval] < _userDCA.lastSwap ? performedSwaps[_userDCA.swapInterval] : _userDCA.lastSwap
    ];

    uint256 _accumPerUnit = _accumRatesLastSwap - _accumRatesPerUnit[_userDCA.swapInterval][_from][_userDCA.lastWithdrawSwap];
    uint256 _magnitude = _userDCA.fromTokenA ? _magnitudeA : _magnitudeB;
    (bool _ok, uint256 _mult) = Math.tryMul(_accumPerUnit, _userDCA.rate);
    uint256 _swappedInCurrentPosition = _ok ? _mult / _magnitude : (_accumPerUnit / _magnitude) * _userDCA.rate;
    _swapped = _swappedInCurrentPosition + _userDCA.swappedBeforeModified;
  }

  /** Returns how many FROM remains unswapped  */
  function _calculateUnswapped(uint256 _dcaId) internal view returns (uint256 _unswapped) {
    uint32 _performedSwaps = performedSwaps[_userPositions[_dcaId].swapInterval];
    uint32 _lastSwap = _userPositions[_dcaId].lastSwap;

    if (_lastSwap <= _performedSwaps) return 0;
    _unswapped = (_lastSwap - _performedSwaps) * _userPositions[_dcaId].rate;
  }

  function _getFrom(uint256 _dcaId) internal view returns (IERC20Metadata _from) {
    _from = _userPositions[_dcaId].fromTokenA ? tokenA : tokenB;
  }

  function _getTo(uint256 _dcaId) internal view returns (IERC20Metadata _to) {
    _to = _userPositions[_dcaId].fromTokenA ? tokenB : tokenA;
  }
}
