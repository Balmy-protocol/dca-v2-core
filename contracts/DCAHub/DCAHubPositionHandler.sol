// SPDX-License-Identifier: BUSL-1.1
pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/security/ReentrancyGuard.sol';

import './DCAHubConfigHandler.sol';

abstract contract DCAHubPositionHandler is ReentrancyGuard, DCAHubConfigHandler, IDCAHubPositionHandler {
  // TODO: Explore if we can make reduce the storage size
  struct DCA {
    uint32 swapWhereLastUpdated; // Includes both modify and withdraw
    uint32 finalSwap;
    uint32 swapInterval; // TODO: We can now store the index directly in a uint8
    uint160 rate;
    address from;
    address to;
    uint248 swappedBeforeModified;
  }

  using SafeERC20 for IERC20Metadata;
  using EnumerableSet for EnumerableSet.UintSet;

  IDCAPermissionManager public permissionManager;
  mapping(uint256 => DCA) internal _userPositions;
  uint256 internal _idCounter;

  constructor(IDCAPermissionManager _permissionManager) {
    if (address(_permissionManager) == address(0)) revert CommonErrors.ZeroAddress();
    permissionManager = _permissionManager;
  }

  function userPosition(uint256 _dcaId) external view override returns (UserPosition memory _userPosition) {
    DCA memory _position = _userPositions[_dcaId];
    uint32 _performedSwaps = _getPerformedSwaps(_position.from, _position.to, _position.swapInterval);
    _userPosition.from = IERC20Metadata(_position.from);
    _userPosition.to = IERC20Metadata(_position.to);
    _userPosition.swapInterval = _position.swapInterval;
    _userPosition.swapsExecuted = _position.swapWhereLastUpdated < _position.finalSwap
      ? uint32(Math.min(_performedSwaps, _position.finalSwap)) - _position.swapWhereLastUpdated
      : 0;
    _userPosition.swapped = _position.swapInterval > 0 ? _calculateSwapped(_position, _performedSwaps) : 0;
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
  ) external override nonReentrant returns (uint256) {
    if (_from == address(0) || _to == address(0) || _owner == address(0)) revert CommonErrors.ZeroAddress();
    if (_from == _to) revert InvalidToken();
    if (_amount == 0) revert ZeroAmount();
    if (_amountOfSwaps == 0) revert ZeroSwaps();
    if (!this.isSwapIntervalAllowed(_swapInterval)) revert InvalidInterval();
    IERC20Metadata(_from).safeTransferFrom(msg.sender, address(this), _amount);
    _balances[_from] += _amount;
    uint160 _rate = uint160(_amount / _amountOfSwaps);
    _idCounter += 1;
    permissionManager.mint(_idCounter, _owner, _permissions);
    if (_from < _to) {
      _activeSwapIntervals[_from][_to].add(_swapInterval);
    } else {
      _activeSwapIntervals[_to][_from].add(_swapInterval);
    }
    (uint32 _startingSwap, uint32 _finalSwap) = _addPosition(_idCounter, _from, _to, _rate, _amountOfSwaps, 0, _swapInterval);
    emit Deposited(msg.sender, _owner, _idCounter, _from, _to, _rate, _startingSwap, _swapInterval, _finalSwap);
    return _idCounter;
  }

  function withdrawSwapped(uint256 _dcaId, address _recipient) external override nonReentrant returns (uint256 _swapped) {
    if (_recipient == address(0)) revert CommonErrors.ZeroAddress();

    DCA memory _userPosition = _userPositions[_dcaId];
    _assertPositionExistsAndCallerHasPermission(_dcaId, _userPosition, IDCAPermissionManager.Permission.WITHDRAW);
    uint32 _performedSwaps = _getPerformedSwaps(_userPosition.from, _userPosition.to, _userPosition.swapInterval);
    _swapped = _calculateSwapped(_userPosition, _performedSwaps);

    _userPositions[_dcaId].swapWhereLastUpdated = _performedSwaps;
    _userPositions[_dcaId].swappedBeforeModified = 0;

    _balances[_userPosition.to] -= _swapped;
    IERC20Metadata(_userPosition.to).safeTransfer(_recipient, _swapped);

    emit Withdrew(msg.sender, _recipient, _dcaId, _userPosition.to, _swapped);
  }

  function withdrawSwappedMany(PositionSet[] calldata _positions, address _recipient) external override nonReentrant {
    if (_recipient == address(0)) revert CommonErrors.ZeroAddress();
    uint256[] memory _swapped = new uint256[](_positions.length);
    for (uint256 i; i < _positions.length; i++) {
      address _token = _positions[i].token;
      for (uint256 j; j < _positions[i].positionIds.length; j++) {
        uint256 _positionId = _positions[i].positionIds[j];
        DCA memory _userPosition = _userPositions[_positions[i].positionIds[j]];
        _assertPositionExistsAndCallerHasPermission(_positionId, _userPosition, IDCAPermissionManager.Permission.WITHDRAW);
        if (_userPosition.to != _token) revert PositionDoesNotMatchToken();
        uint32 _performedSwaps = _getPerformedSwaps(_userPosition.from, _userPosition.to, _userPosition.swapInterval);
        _swapped[i] += _calculateSwapped(_userPosition, _performedSwaps);
        _userPositions[_positionId].swapWhereLastUpdated = _performedSwaps;
        _userPositions[_positionId].swappedBeforeModified = 0;
      }
      _balances[_token] -= _swapped[i];
      IERC20Metadata(_token).safeTransfer(_recipient, _swapped[i]);
    }
    emit WithdrewMany(msg.sender, _recipient, _positions, _swapped);
  }

  function terminate(
    uint256 _dcaId,
    address _recipientUnswapped,
    address _recipientSwapped
  ) external override nonReentrant {
    if (_recipientUnswapped == address(0) || _recipientSwapped == address(0)) revert CommonErrors.ZeroAddress();

    DCA memory _userPosition = _userPositions[_dcaId];
    _assertPositionExistsAndCallerHasPermission(_dcaId, _userPosition, IDCAPermissionManager.Permission.TERMINATE);
    uint32 _performedSwaps = _getPerformedSwaps(_userPosition.from, _userPosition.to, _userPosition.swapInterval);

    uint256 _swapped = _calculateSwapped(_userPosition, _performedSwaps);
    uint256 _unswapped = _calculateUnswapped(_userPosition, _performedSwaps);

    _removeFromDelta(_userPosition, _performedSwaps);
    delete _userPositions[_dcaId];
    permissionManager.burn(_dcaId);

    if (_swapped > 0) {
      _balances[_userPosition.to] -= _swapped;
      IERC20Metadata(_userPosition.to).safeTransfer(_recipientSwapped, _swapped);
    }

    if (_unswapped > 0) {
      _balances[_userPosition.from] -= _unswapped;
      IERC20Metadata(_userPosition.from).safeTransfer(_recipientUnswapped, _unswapped);
    }

    emit Terminated(msg.sender, _recipientUnswapped, _recipientSwapped, _dcaId, _unswapped, _swapped);
  }

  function increasePosition(
    uint256 _positionId,
    uint256 _amount,
    uint32 _newAmountOfSwaps
  ) external override nonReentrant {
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
    DCA memory _userDCA = _userPositions[_positionId];
    _assertPositionExistsAndCallerHasPermission(
      _positionId,
      _userDCA,
      _increase ? IDCAPermissionManager.Permission.INCREASE : IDCAPermissionManager.Permission.REDUCE
    );

    uint32 _performedSwaps = _getPerformedSwaps(_userDCA.from, _userDCA.to, _userDCA.swapInterval);
    uint256 _unswapped = _calculateUnswapped(_userDCA, _performedSwaps);
    uint256 _total = _increase ? _unswapped + _amount : _unswapped - _amount;
    if (_total != 0 && _newAmountOfSwaps == 0) revert ZeroSwaps();
    if (_total == 0 && _newAmountOfSwaps > 0) _newAmountOfSwaps = 0;
    uint160 _newRate = _newAmountOfSwaps == 0 ? 0 : uint160(_total / _newAmountOfSwaps);

    uint256 _swapped = _calculateSwapped(_userDCA, _performedSwaps);
    if (_swapped > type(uint248).max) revert MandatoryWithdraw(); // You should withdraw before modifying, to avoid losing funds

    _removeFromDelta(_userDCA, _performedSwaps);
    uint32 _startingSwap = _performedSwaps + 1;
    uint32 _finalSwap = _performedSwaps + _newAmountOfSwaps;
    _addToDelta(_userDCA.from, _userDCA.to, _userDCA.swapInterval, _finalSwap, _newRate);

    _userPositions[_positionId].swapWhereLastUpdated = _performedSwaps;
    _userPositions[_positionId].finalSwap = _finalSwap;
    _userPositions[_positionId].rate = _newRate;
    _userPositions[_positionId].swappedBeforeModified = uint248(_swapped);

    if (_increase) {
      IERC20Metadata(_userDCA.from).safeTransferFrom(msg.sender, address(this), _amount);
      _balances[_userDCA.from] += _amount;
    } else {
      _balances[_userDCA.from] -= _amount;
      IERC20Metadata(_userDCA.from).safeTransfer(msg.sender, _amount);
    }

    emit Modified(msg.sender, _positionId, _newRate, _startingSwap, _finalSwap);
  }

  function _assertPositionExistsAndCallerHasPermission(
    uint256 _positionId,
    DCA memory _userPosition,
    IDCAPermissionManager.Permission _permission
  ) internal view {
    if (_userPosition.swapInterval == 0) revert InvalidPosition();
    if (!permissionManager.hasPermission(_positionId, msg.sender, _permission)) revert UnauthorizedCaller();
  }

  function _addPosition(
    uint256 _dcaId,
    address _from,
    address _to,
    uint160 _rate,
    uint32 _amountOfSwaps,
    uint248 _swappedBeforeModified,
    uint32 _swapInterval
  ) internal returns (uint32 _startingSwap, uint32 _finalSwap) {
    uint32 _performedSwaps = _getPerformedSwaps(_from, _to, _swapInterval);
    _startingSwap = _performedSwaps + 1;
    _finalSwap = _performedSwaps + _amountOfSwaps;
    _addToDelta(_from, _to, _swapInterval, _finalSwap, _rate);
    _userPositions[_dcaId] = DCA(_performedSwaps, _finalSwap, _swapInterval, _rate, _from, _to, _swappedBeforeModified);
  }

  function _addToDelta(
    address _from,
    address _to,
    uint32 _swapInterval,
    uint32 _finalSwap,
    uint160 _rate
  ) internal {
    if (_from < _to) {
      swapData[_from][_to][_swapInterval].nextAmountToSwapAToB += _rate;
      swapAmountDelta[_from][_to][_swapInterval][_finalSwap + 1].swapDeltaAToB -= int160(_rate);
    } else {
      swapData[_to][_from][_swapInterval].nextAmountToSwapBToA += _rate;
      swapAmountDelta[_to][_from][_swapInterval][_finalSwap + 1].swapDeltaBToA -= int160(_rate);
    }
  }

  function _removeFromDelta(DCA memory _userPosition, uint32 _performedSwaps) internal {
    if (_userPosition.finalSwap > _performedSwaps) {
      if (_userPosition.from < _userPosition.to) {
        swapData[_userPosition.from][_userPosition.to][_userPosition.swapInterval].nextAmountToSwapAToB -= _userPosition.rate;
        swapAmountDelta[_userPosition.from][_userPosition.to][_userPosition.swapInterval][_userPosition.finalSwap + 1].swapDeltaAToB += int160(
          _userPosition.rate
        );
      } else {
        swapData[_userPosition.to][_userPosition.from][_userPosition.swapInterval].nextAmountToSwapBToA -= _userPosition.rate;
        swapAmountDelta[_userPosition.to][_userPosition.from][_userPosition.swapInterval][_userPosition.finalSwap + 1].swapDeltaBToA += int160(
          _userPosition.rate
        );
      }
    }
  }

  /** Returns the amount of tokens swapped in TO */
  function _calculateSwapped(DCA memory _userDCA, uint32 _performedSwaps) internal view returns (uint256 _swapped) {
    uint32 _newestSwapToConsider = _performedSwaps < _userDCA.finalSwap ? _performedSwaps : _userDCA.finalSwap;

    if (_userDCA.swapWhereLastUpdated > _newestSwapToConsider) {
      // If last update happened after the position's final swap, then a withdraw was executed, and we just return 0
      return 0;
    } else if (_userDCA.swapWhereLastUpdated == _newestSwapToConsider) {
      // If the last update matches the positions's final swap, then we can avoid all calculation below
      return _userDCA.swappedBeforeModified;
    }

    uint256 _accumPerUnit;
    if (_userDCA.from < _userDCA.to) {
      _accumPerUnit =
        accumRatio[_userDCA.from][_userDCA.to][_userDCA.swapInterval][_newestSwapToConsider].accumRatioAToB -
        accumRatio[_userDCA.from][_userDCA.to][_userDCA.swapInterval][_userDCA.swapWhereLastUpdated].accumRatioAToB;
    } else {
      _accumPerUnit =
        accumRatio[_userDCA.to][_userDCA.from][_userDCA.swapInterval][_newestSwapToConsider].accumRatioBToA -
        accumRatio[_userDCA.to][_userDCA.from][_userDCA.swapInterval][_userDCA.swapWhereLastUpdated].accumRatioBToA;
    }
    uint256 _magnitude = 10**IERC20Metadata(_userDCA.from).decimals();
    (bool _ok, uint256 _mult) = Math.tryMul(_accumPerUnit, _userDCA.rate);
    uint256 _swappedInCurrentPosition = _ok ? _mult / _magnitude : (_accumPerUnit / _magnitude) * _userDCA.rate;
    _swapped = _swappedInCurrentPosition + _userDCA.swappedBeforeModified;
  }

  /** Returns how many FROM remains unswapped  */
  function _calculateUnswapped(DCA memory _userPosition, uint32 _performedSwaps) internal pure returns (uint256 _unswapped) {
    _unswapped = (_userPosition.finalSwap <= _performedSwaps) ? 0 : (_userPosition.finalSwap - _performedSwaps) * _userPosition.rate;
  }

  function _getPerformedSwaps(
    address _from,
    address _to,
    uint32 _swapInterval
  ) internal view returns (uint32) {
    // TODO: Check if it's better to just receive the in-memory DCA
    return (_from < _to) ? swapData[_from][_to][_swapInterval].performedSwaps : swapData[_to][_from][_swapInterval].performedSwaps;
  }
}
