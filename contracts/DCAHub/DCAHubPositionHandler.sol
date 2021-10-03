// SPDX-License-Identifier: BUSL-1.1
pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/security/ReentrancyGuard.sol';
import '../libraries/Intervals.sol';
import './DCAHubConfigHandler.sol';

abstract contract DCAHubPositionHandler is ReentrancyGuard, DCAHubConfigHandler, IDCAHubPositionHandler {
  struct DCA {
    uint32 swapWhereLastUpdated; // Includes both modify and withdraw
    uint32 finalSwap;
    bytes1 swapIntervalMask;
    uint120 rate;
    address from;
    address to;
  }

  using SafeERC20 for IERC20Metadata;

  IDCAPermissionManager public permissionManager;
  mapping(uint256 => DCA) internal _userPositions;
  mapping(uint256 => uint256) internal _swappedBeforeModified;
  uint256 internal _idCounter;

  constructor(IDCAPermissionManager _permissionManager) {
    _assertNonZeroAddress(address(_permissionManager));
    permissionManager = _permissionManager;
  }

  function userPosition(uint256 _positionId) external view returns (UserPosition memory _userPosition) {
    DCA memory _position = _userPositions[_positionId];
    uint32 _performedSwaps = _getPerformedSwaps(_position.from, _position.to, _position.swapIntervalMask);
    uint32 _newestSwapToConsider = _performedSwaps < _position.finalSwap ? _performedSwaps : _position.finalSwap;
    _userPosition.from = IERC20Metadata(_position.from);
    _userPosition.to = IERC20Metadata(_position.to);
    _userPosition.swapsExecuted = _position.swapWhereLastUpdated < _newestSwapToConsider
      ? _newestSwapToConsider - _position.swapWhereLastUpdated
      : 0;
    _userPosition.swapsLeft = _position.finalSwap > _performedSwaps ? _position.finalSwap - _performedSwaps : 0;
    _userPosition.remaining = _calculateUnswapped(_position, _performedSwaps);
    _userPosition.rate = _position.rate;
    if (_position.swapIntervalMask > 0) {
      _userPosition.swapInterval = Intervals.maskToInterval(_position.swapIntervalMask);
      _userPosition.swapped = _calculateSwapped(_positionId, _position, _performedSwaps);
    }
  }

  function deposit(
    address _from,
    address _to,
    uint256 _amount,
    uint32 _amountOfSwaps,
    uint32 _swapInterval,
    address _owner,
    IDCAPermissionManager.PermissionSet[] calldata _permissions
  ) external nonReentrant whenNotPaused returns (uint256) {
    if (_from == address(0) || _to == address(0) || _owner == address(0)) revert IDCAHub.ZeroAddress();
    if (_from == _to) revert InvalidToken();
    if (_amount == 0) revert ZeroAmount();
    if (_amountOfSwaps == 0) revert ZeroSwaps();
    bytes1 _mask = Intervals.intervalToMask(_swapInterval);
    if (allowedSwapIntervals & _mask == 0) revert IntervalNotAllowed();
    IERC20Metadata(_from).safeTransferFrom(msg.sender, address(this), _amount);
    _idCounter += 1;
    permissionManager.mint(_idCounter, _owner, _permissions);
    if (_from < _to) {
      _updateActiveIntervalsAndOracle(_from, _to, _mask);
    } else {
      _updateActiveIntervalsAndOracle(_to, _from, _mask);
    }
    _addPosition(_idCounter, _from, _to, uint120(_amount / _amountOfSwaps), _amountOfSwaps, _mask, _swapInterval, _owner);
    return _idCounter;
  }

  function withdrawSwapped(uint256 _positionId, address _recipient) external nonReentrant returns (uint256) {
    _assertNonZeroAddress(_recipient);

    (uint256 _swapped, address _to) = _executeWithdraw(_positionId);
    IERC20Metadata(_to).safeTransfer(_recipient, _swapped);
    emit Withdrew(msg.sender, _recipient, _positionId, _to, _swapped);
    return _swapped;
  }

  function withdrawSwappedMany(PositionSet[] calldata _positions, address _recipient) external nonReentrant {
    _assertNonZeroAddress(_recipient);
    uint256[] memory _swapped = new uint256[](_positions.length);
    for (uint256 i; i < _positions.length; i++) {
      address _token = _positions[i].token;
      for (uint256 j; j < _positions[i].positionIds.length; j++) {
        (uint256 _swappedByPosition, address _to) = _executeWithdraw(_positions[i].positionIds[j]);
        if (_to != _token) revert PositionDoesNotMatchToken();
        _swapped[i] += _swappedByPosition;
      }
      IERC20Metadata(_token).safeTransfer(_recipient, _swapped[i]);
    }
    emit WithdrewMany(msg.sender, _recipient, _positions, _swapped);
  }

  function terminate(
    uint256 _positionId,
    address _recipientUnswapped,
    address _recipientSwapped
  ) external nonReentrant {
    if (_recipientUnswapped == address(0) || _recipientSwapped == address(0)) revert IDCAHub.ZeroAddress();

    DCA memory _userPosition = _userPositions[_positionId];
    _assertPositionExistsAndCallerHasPermission(_positionId, _userPosition, IDCAPermissionManager.Permission.TERMINATE);
    uint32 _performedSwaps = _getPerformedSwaps(_userPosition.from, _userPosition.to, _userPosition.swapIntervalMask);

    uint256 _swapped = _calculateSwapped(_positionId, _userPosition, _performedSwaps);
    uint256 _unswapped = _calculateUnswapped(_userPosition, _performedSwaps);

    _removeFromDelta(_userPosition, _performedSwaps);
    delete _userPositions[_positionId];
    permissionManager.burn(_positionId);

    if (_swapped > 0) {
      IERC20Metadata(_userPosition.to).safeTransfer(_recipientSwapped, _swapped);
    }

    if (_unswapped > 0) {
      IERC20Metadata(_userPosition.from).safeTransfer(_recipientUnswapped, _unswapped);
    }

    emit Terminated(msg.sender, _recipientUnswapped, _recipientSwapped, _positionId, _unswapped, _swapped);
  }

  function increasePosition(
    uint256 _positionId,
    uint256 _amount,
    uint32 _newAmountOfSwaps
  ) external nonReentrant whenNotPaused {
    _modify(_positionId, _amount, _newAmountOfSwaps, address(0));
  }

  function reducePosition(
    uint256 _positionId,
    uint256 _amount,
    uint32 _newAmountOfSwaps,
    address _recipient
  ) external nonReentrant {
    _assertNonZeroAddress(_recipient);
    _modify(_positionId, _amount, _newAmountOfSwaps, _recipient);
  }

  function _modify(
    uint256 _positionId,
    uint256 _amount,
    uint32 _newAmountOfSwaps,
    address _recipient
  ) internal {
    DCA memory _userPosition = _userPositions[_positionId];
    bool _increase = _recipient == address(0);
    _assertPositionExistsAndCallerHasPermission(
      _positionId,
      _userPosition,
      _increase ? IDCAPermissionManager.Permission.INCREASE : IDCAPermissionManager.Permission.REDUCE
    );

    uint32 _performedSwaps = _getPerformedSwaps(_userPosition.from, _userPosition.to, _userPosition.swapIntervalMask);
    uint256 _unswapped = _calculateUnswapped(_userPosition, _performedSwaps);
    uint256 _total = _increase ? _unswapped + _amount : _unswapped - _amount;
    if (_total != 0 && _newAmountOfSwaps == 0) revert ZeroSwaps();
    if (_total == 0 && _newAmountOfSwaps > 0) _newAmountOfSwaps = 0;
    uint120 _newRate = _newAmountOfSwaps == 0 ? 0 : uint120(_total / _newAmountOfSwaps);

    uint256 _swapped = _calculateSwapped(_positionId, _userPosition, _performedSwaps);

    _removeFromDelta(_userPosition, _performedSwaps);
    uint32 _startingSwap = _performedSwaps + 1;
    uint32 _finalSwap = _performedSwaps + _newAmountOfSwaps;
    _addToDelta(_userPosition.from, _userPosition.to, _userPosition.swapIntervalMask, _finalSwap, _newRate);

    _userPositions[_positionId].swapWhereLastUpdated = _performedSwaps;
    _userPositions[_positionId].finalSwap = _finalSwap;
    _userPositions[_positionId].rate = _newRate;
    _swappedBeforeModified[_positionId] = _swapped;

    if (_increase) {
      IERC20Metadata(_userPosition.from).safeTransferFrom(msg.sender, address(this), _amount);
    } else {
      IERC20Metadata(_userPosition.from).safeTransfer(_recipient, _amount);
    }

    emit Modified(msg.sender, _positionId, _newRate, _startingSwap, _finalSwap);
  }

  function _assertPositionExistsAndCallerHasPermission(
    uint256 _positionId,
    DCA memory _userPosition,
    IDCAPermissionManager.Permission _permission
  ) internal view {
    if (_userPosition.swapIntervalMask == 0) revert InvalidPosition();
    if (!permissionManager.hasPermission(_positionId, msg.sender, _permission)) revert UnauthorizedCaller();
  }

  function _addPosition(
    uint256 _positionId,
    address _from,
    address _to,
    uint120 _rate,
    uint32 _amountOfSwaps,
    bytes1 _swapIntervalMask,
    uint32 _swapInterval,
    address _owner
  ) internal {
    uint32 _performedSwaps = _getPerformedSwaps(_from, _to, _swapIntervalMask);
    uint32 _finalSwap = _performedSwaps + _amountOfSwaps;
    _addToDelta(_from, _to, _swapIntervalMask, _finalSwap, _rate);
    _userPositions[_positionId] = DCA(_performedSwaps, _finalSwap, _swapIntervalMask, _rate, _from, _to);
    emit Deposited(msg.sender, _owner, _idCounter, _from, _to, _swapInterval, _rate, _performedSwaps + 1, _finalSwap);
  }

  function _addToDelta(
    address _from,
    address _to,
    bytes1 _swapIntervalMask,
    uint32 _finalSwap,
    uint120 _rate
  ) internal {
    _modifyDelta(_from, _to, _swapIntervalMask, _finalSwap, _rate, true);
  }

  function _removeFromDelta(DCA memory _userPosition, uint32 _performedSwaps) internal {
    if (_userPosition.finalSwap > _performedSwaps) {
      _modifyDelta(_userPosition.from, _userPosition.to, _userPosition.swapIntervalMask, _userPosition.finalSwap, _userPosition.rate, false);
    }
  }

  function _modifyDelta(
    address _from,
    address _to,
    bytes1 _swapIntervalMask,
    uint32 _finalSwap,
    uint120 _rate,
    bool _add
  ) internal {
    // Note: this function might look weird and unnecessary, but after a few different tries, it was the best way to reduce contract size,
    // while also avoding the need for unchecked math
    int120 _intRate = _add ? -int120(_rate) : int120(_rate);
    if (_from < _to) {
      if (_add) {
        swapData[_from][_to][_swapIntervalMask].nextAmountToSwapAToB += _rate;
      } else {
        swapData[_from][_to][_swapIntervalMask].nextAmountToSwapAToB -= _rate;
      }
      swapAmountDelta[_from][_to][_swapIntervalMask][_finalSwap + 1].swapDeltaAToB += _intRate;
    } else {
      if (_add) {
        swapData[_to][_from][_swapIntervalMask].nextAmountToSwapBToA += _rate;
      } else {
        swapData[_to][_from][_swapIntervalMask].nextAmountToSwapBToA -= _rate;
      }
      swapAmountDelta[_to][_from][_swapIntervalMask][_finalSwap + 1].swapDeltaBToA += _intRate;
    }
  }

  function _updateActiveIntervalsAndOracle(
    address _tokenA,
    address _tokenB,
    bytes1 _mask
  ) internal {
    bytes1 _activeIntervals = activeSwapIntervals[_tokenA][_tokenB];
    if (_activeIntervals & _mask == 0) {
      if (_activeIntervals == 0) {
        oracle.addSupportForPairIfNeeded(_tokenA, _tokenB);
      }
      activeSwapIntervals[_tokenA][_tokenB] = _activeIntervals | _mask;
    }
  }

  /** Returns the amount of tokens swapped in TO */
  function _calculateSwapped(
    uint256 _positionId,
    DCA memory _userPosition,
    uint32 _performedSwaps
  ) internal view returns (uint256 _swapped) {
    uint32 _newestSwapToConsider = _performedSwaps < _userPosition.finalSwap ? _performedSwaps : _userPosition.finalSwap;

    if (_userPosition.swapWhereLastUpdated > _newestSwapToConsider) {
      // If last update happened after the position's final swap, then a withdraw was executed, and we just return 0
      return 0;
    } else if (_userPosition.swapWhereLastUpdated == _newestSwapToConsider) {
      // If the last update matches the positions's final swap, then we can avoid all calculation below
      return _swappedBeforeModified[_positionId];
    }

    uint256 _accumRatio = _userPosition.from < _userPosition.to
      ? accumRatio[_userPosition.from][_userPosition.to][_userPosition.swapIntervalMask][_newestSwapToConsider].accumRatioAToB -
        accumRatio[_userPosition.from][_userPosition.to][_userPosition.swapIntervalMask][_userPosition.swapWhereLastUpdated].accumRatioAToB
      : accumRatio[_userPosition.to][_userPosition.from][_userPosition.swapIntervalMask][_newestSwapToConsider].accumRatioBToA -
        accumRatio[_userPosition.to][_userPosition.from][_userPosition.swapIntervalMask][_userPosition.swapWhereLastUpdated].accumRatioBToA;
    uint256 _magnitude = _calculateMagnitude(_userPosition.from);
    (bool _ok, uint256 _mult) = Math.tryMul(_accumRatio, _userPosition.rate);
    uint256 _swappedInCurrentPosition = _ok ? _mult / _magnitude : (_accumRatio / _magnitude) * _userPosition.rate;
    _swapped = _swappedInCurrentPosition + _swappedBeforeModified[_positionId];
  }

  /** Returns how many FROM remains unswapped  */
  function _calculateUnswapped(DCA memory _userPosition, uint32 _performedSwaps) internal pure returns (uint256 _unswapped) {
    _unswapped = (_userPosition.finalSwap <= _performedSwaps) ? 0 : (_userPosition.finalSwap - _performedSwaps) * _userPosition.rate;
  }

  function _executeWithdraw(uint256 _positionId) internal returns (uint256 _swapped, address _to) {
    DCA memory _userPosition = _userPositions[_positionId];
    _assertPositionExistsAndCallerHasPermission(_positionId, _userPosition, IDCAPermissionManager.Permission.WITHDRAW);
    uint32 _performedSwaps = _getPerformedSwaps(_userPosition.from, _userPosition.to, _userPosition.swapIntervalMask);
    _swapped = _calculateSwapped(_positionId, _userPosition, _performedSwaps);
    _to = _userPosition.to;
    _userPositions[_positionId].swapWhereLastUpdated = _performedSwaps;
    delete _swappedBeforeModified[_positionId];
  }

  function _getPerformedSwaps(
    address _from,
    address _to,
    bytes1 _swapIntervalMask
  ) internal view returns (uint32) {
    return (_from < _to) ? swapData[_from][_to][_swapIntervalMask].performedSwaps : swapData[_to][_from][_swapIntervalMask].performedSwaps;
  }
}
