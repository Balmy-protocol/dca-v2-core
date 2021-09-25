// SPDX-License-Identifier: BUSL-1.1
pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/security/ReentrancyGuard.sol';

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

  error IntervalNotAllowed();

  using SafeERC20 for IERC20Metadata;

  IDCAPermissionManager public permissionManager;
  mapping(uint256 => DCA) internal _userPositions;
  mapping(uint256 => uint256) internal _swappedBeforeModified;
  uint256 internal _idCounter;

  constructor(IDCAPermissionManager _permissionManager) {
    if (address(_permissionManager) == address(0)) revert CommonErrors.ZeroAddress();
    permissionManager = _permissionManager;
  }

  function userPosition(uint256 _positionId) external view override returns (UserPosition memory _userPosition) {
    DCA memory _position = _userPositions[_positionId];
    uint32 _performedSwaps = _getPerformedSwaps(_position.from, _position.to, _position.swapIntervalMask);
    uint32 _newestSwapToConsider = _performedSwaps < _position.finalSwap ? _performedSwaps : _position.finalSwap;
    _userPosition.from = IERC20Metadata(_position.from);
    _userPosition.to = IERC20Metadata(_position.to);
    _userPosition.swapInterval = _position.swapIntervalMask > 0 ? maskToInterval(_position.swapIntervalMask) : 0;
    _userPosition.swapsExecuted = _position.swapWhereLastUpdated < _newestSwapToConsider
      ? _newestSwapToConsider - _position.swapWhereLastUpdated
      : 0;
    _userPosition.swapped = _position.swapIntervalMask > 0 ? _calculateSwapped(_positionId, _position, _performedSwaps) : 0;
    _userPosition.swapsLeft = _position.finalSwap > _performedSwaps ? _position.finalSwap - _performedSwaps : 0;
    _userPosition.remaining = _calculateUnswapped(_position, _performedSwaps);
    _userPosition.rate = _position.rate;
  }

  function deposit(
    address _from,
    address _to,
    uint256 _amount,
    uint32 _amountOfSwaps,
    uint32 _swapInterval,
    address _owner,
    IDCAPermissionManager.PermissionSet[] calldata _permissions
  ) external override nonReentrant whenNotPaused returns (uint256) {
    if (_from == address(0) || _to == address(0) || _owner == address(0)) revert CommonErrors.ZeroAddress();
    if (_from == _to) revert InvalidToken();
    if (_amount == 0) revert ZeroAmount();
    if (_amountOfSwaps == 0) revert ZeroSwaps();
    bytes1 _mask = intervalToMask(_swapInterval);
    if (allowedSwapIntervals & _mask == 0) revert IntervalNotAllowed();
    IERC20Metadata(_from).safeTransferFrom(msg.sender, address(this), _amount);
    uint120 _rate = uint120(_amount / _amountOfSwaps);
    _idCounter += 1;
    permissionManager.mint(_idCounter, _owner, _permissions);
    if (_from < _to) {
      activeSwapIntervals[_from][_to] |= _mask;
    } else {
      activeSwapIntervals[_to][_from] |= _mask;
    }
    _addPosition(_idCounter, _from, _to, _rate, _amountOfSwaps, _mask, _swapInterval, _owner);
    return _idCounter;
  }

  function withdrawSwapped(uint256 _positionId, address _recipient) external override nonReentrant returns (uint256) {
    if (_recipient == address(0)) revert CommonErrors.ZeroAddress();

    (uint256 _swapped, address _to) = _executeWithdraw(_positionId);
    IERC20Metadata(_to).safeTransfer(_recipient, _swapped);
    emit Withdrew(msg.sender, _recipient, _positionId, _to, _swapped);
    return _swapped;
  }

  function withdrawSwappedMany(PositionSet[] calldata _positions, address _recipient) external override nonReentrant {
    if (_recipient == address(0)) revert CommonErrors.ZeroAddress();
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
  ) external override nonReentrant {
    if (_recipientUnswapped == address(0) || _recipientSwapped == address(0)) revert CommonErrors.ZeroAddress();

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
  ) external override nonReentrant whenNotPaused {
    _modify(_positionId, _amount, _newAmountOfSwaps, true);
  }

  function reducePosition(
    uint256 _positionId,
    uint256 _amount,
    uint32 _newAmountOfSwaps
  ) external nonReentrant {
    _modify(_positionId, _amount, _newAmountOfSwaps, false);
  }

  function _modify(
    uint256 _positionId,
    uint256 _amount,
    uint32 _newAmountOfSwaps,
    bool _increase
  ) internal {
    DCA memory _userPosition = _userPositions[_positionId];
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
      IERC20Metadata(_userPosition.from).safeTransfer(msg.sender, _amount);
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
    uint32 _startingSwap = _performedSwaps + 1;
    uint32 _finalSwap = _performedSwaps + _amountOfSwaps;
    _addToDelta(_from, _to, _swapIntervalMask, _finalSwap, _rate);
    _userPositions[_positionId] = DCA(_performedSwaps, _finalSwap, _swapIntervalMask, _rate, _from, _to);
    emit Deposited(msg.sender, _owner, _idCounter, _from, _to, _rate, _startingSwap, _swapInterval, _finalSwap);
  }

  function _addToDelta(
    address _from,
    address _to,
    bytes1 _swapIntervalMask,
    uint32 _finalSwap,
    uint120 _rate
  ) internal {
    _modifyDelta(_from, _to, _swapIntervalMask, _finalSwap, int120(_rate));
  }

  function _removeFromDelta(DCA memory _userPosition, uint32 _performedSwaps) internal {
    if (_userPosition.finalSwap > _performedSwaps) {
      _modifyDelta(_userPosition.from, _userPosition.to, _userPosition.swapIntervalMask, _userPosition.finalSwap, -int120(_userPosition.rate));
    }
  }

  function _modifyDelta(
    address _from,
    address _to,
    bytes1 _swapIntervalMask,
    uint32 _finalSwap,
    int120 _rate
  ) internal {
    unchecked {
      if (_from < _to) {
        swapData[_from][_to][_swapIntervalMask].nextAmountToSwapAToB += uint224(int224(_rate));
        swapAmountDelta[_from][_to][_swapIntervalMask][_finalSwap + 1].swapDeltaAToB -= _rate;
      } else {
        swapData[_to][_from][_swapIntervalMask].nextAmountToSwapBToA += uint224(int224(_rate));
        swapAmountDelta[_to][_from][_swapIntervalMask][_finalSwap + 1].swapDeltaBToA -= _rate;
      }
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

    uint256 _accumPerUnit = _userPosition.from < _userPosition.to
      ? accumRatio[_userPosition.from][_userPosition.to][_userPosition.swapIntervalMask][_newestSwapToConsider].accumRatioAToB -
        accumRatio[_userPosition.from][_userPosition.to][_userPosition.swapIntervalMask][_userPosition.swapWhereLastUpdated].accumRatioAToB
      : accumRatio[_userPosition.to][_userPosition.from][_userPosition.swapIntervalMask][_newestSwapToConsider].accumRatioBToA -
        accumRatio[_userPosition.to][_userPosition.from][_userPosition.swapIntervalMask][_userPosition.swapWhereLastUpdated].accumRatioBToA;
    uint256 _magnitude = 10**IERC20Metadata(_userPosition.from).decimals();
    (bool _ok, uint256 _mult) = Math.tryMul(_accumPerUnit, _userPosition.rate);
    uint256 _swappedInCurrentPosition = _ok ? _mult / _magnitude : (_accumPerUnit / _magnitude) * _userPosition.rate;
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
    // TODO: Check if it's better to just receive the in-memory DCA
    return (_from < _to) ? swapData[_from][_to][_swapIntervalMask].performedSwaps : swapData[_to][_from][_swapIntervalMask].performedSwaps;
  }
}
