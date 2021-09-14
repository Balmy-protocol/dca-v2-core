// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.6;

import '@openzeppelin/contracts/token/ERC721/ERC721.sol';
import '@openzeppelin/contracts/security/ReentrancyGuard.sol';

import './DCAHubParameters.sol';

abstract contract DCAHubPositionHandler is ReentrancyGuard, DCAHubParameters, IDCAHubPositionHandler, ERC721 {
  // TODO: Explore if we can make reduce the storage size
  struct DCA {
    uint32 swapWhereLastUpdated; // Includes both modify and withdraw
    uint32 finalSwap;
    uint32 swapInterval;
    uint160 rate;
    address from;
    address to;
    uint248 swappedBeforeModified;
  }

  using SafeERC20 for IERC20Metadata;
  using EnumerableSet for EnumerableSet.UintSet;
  using PairSpecificConfig for mapping(address => mapping(address => mapping(uint32 => uint32)));

  mapping(uint256 => DCA) internal _userPositions;
  uint256 internal _idCounter;

  constructor(IERC20Metadata _tokenA, IERC20Metadata _tokenB)
    ERC721(string(abi.encodePacked('DCA: ', _tokenA.symbol(), ' - ', _tokenB.symbol())), 'DCA')
  {}

  function userPosition(uint256 _dcaId) external view override returns (UserPosition memory _userPosition) {
    DCA memory _position = _userPositions[_dcaId];
    uint32 _performedSwaps = performedSwaps.getValue(_position.from, _position.to, _position.swapInterval);
    _userPosition.from = IERC20Metadata(_position.from);
    _userPosition.to = IERC20Metadata(_position.to);
    _userPosition.swapInterval = _position.swapInterval;
    _userPosition.swapsExecuted = _position.swapWhereLastUpdated < _position.finalSwap
      ? uint32(Math.min(_performedSwaps, _position.finalSwap)) - _position.swapWhereLastUpdated
      : 0;
    _userPosition.swapped = _position.swapInterval > 0 ? _calculateSwapped(_dcaId) : 0;
    _userPosition.swapsLeft = _position.finalSwap > _performedSwaps ? _position.finalSwap - _performedSwaps : 0;
    _userPosition.remaining = _calculateUnswapped(_dcaId);
    _userPosition.rate = _position.rate;
  }

  function deposit(
    address _owner,
    address _tokenAddress,
    uint160 _rate,
    uint32 _amountOfSwaps,
    uint32 _swapInterval
  ) external override nonReentrant returns (uint256) {
    if (_owner == address(0)) revert CommonErrors.ZeroAddress();
    if (_tokenAddress != address(tokenA) && _tokenAddress != address(tokenB)) revert InvalidToken();
    if (_amountOfSwaps == 0) revert ZeroSwaps();
    if (
      !_activeSwapIntervals[address(tokenA)][address(tokenB)].contains(_swapInterval) && !globalParameters.isSwapIntervalAllowed(_swapInterval)
    ) revert InvalidInterval();
    uint256 _amount = _rate * _amountOfSwaps;
    IERC20Metadata(_tokenAddress).safeTransferFrom(msg.sender, address(this), _amount);
    _balances[_tokenAddress] += _amount;
    _idCounter += 1;
    _safeMint(_owner, _idCounter);
    _activeSwapIntervals[address(tokenA)][address(tokenB)].add(_swapInterval);
    (uint32 _startingSwap, uint32 _finalSwap) = _addPosition(
      _idCounter,
      _tokenAddress,
      _tokenAddress == address(tokenA) ? address(tokenB) : address(tokenA),
      _rate,
      _amountOfSwaps,
      0,
      _swapInterval
    );
    emit Deposited(msg.sender, _owner, _idCounter, _tokenAddress, _rate, _startingSwap, _swapInterval, _finalSwap);
    return _idCounter;
  }

  function withdrawSwapped(uint256 _dcaId, address _recipient) external override nonReentrant returns (uint256 _swapped) {
    if (_recipient == address(0)) revert CommonErrors.ZeroAddress();

    _assertPositionExistsAndCanBeOperatedByCaller(_dcaId);

    _swapped = _calculateSwapped(_dcaId);

    address _to = _userPositions[_dcaId].to;
    _userPositions[_dcaId].swapWhereLastUpdated = performedSwaps.getValue(_userPositions[_dcaId].from, _to, _userPositions[_dcaId].swapInterval);
    _userPositions[_dcaId].swappedBeforeModified = 0;

    _balances[_to] -= _swapped;
    IERC20Metadata(_to).safeTransfer(_recipient, _swapped);

    emit Withdrew(msg.sender, _recipient, _dcaId, _to, _swapped);
  }

  // { to: token, ids: BigNumber[] }[]
  function withdrawSwappedMany(uint256[] calldata _dcaIds, address _recipient)
    external
    override
    nonReentrant
    returns (uint256 _swappedTokenA, uint256 _swappedTokenB)
  {
    if (_recipient == address(0)) revert CommonErrors.ZeroAddress();
    for (uint256 i; i < _dcaIds.length; i++) {
      uint256 _dcaId = _dcaIds[i];
      _assertPositionExistsAndCanBeOperatedByCaller(_dcaId);
      uint256 _swappedDCA = _calculateSwapped(_dcaId);
      if (_userPositions[_dcaId].to == address(tokenB)) {
        _swappedTokenB += _swappedDCA;
      } else {
        _swappedTokenA += _swappedDCA;
      }
      _userPositions[_dcaId].swapWhereLastUpdated = performedSwaps.getValue(
        _userPositions[_dcaId].from,
        _userPositions[_dcaId].to,
        _userPositions[_dcaId].swapInterval
      );
      _userPositions[_dcaId].swappedBeforeModified = 0;
    }

    if (_swappedTokenA > 0) {
      _balances[address(tokenA)] -= _swappedTokenA;
      tokenA.safeTransfer(_recipient, _swappedTokenA);
    }

    if (_swappedTokenB > 0) {
      _balances[address(tokenB)] -= _swappedTokenB;
      tokenB.safeTransfer(_recipient, _swappedTokenB);
    }
    emit WithdrewMany(msg.sender, _recipient, _dcaIds, _swappedTokenA, _swappedTokenB);
  }

  function terminate(
    uint256 _dcaId,
    address _recipientUnswapped,
    address _recipientSwapped
  ) external override nonReentrant {
    if (_recipientUnswapped == address(0) || _recipientSwapped == address(0)) revert CommonErrors.ZeroAddress();

    _assertPositionExistsAndCanBeOperatedByCaller(_dcaId);

    uint256 _swapped = _calculateSwapped(_dcaId);
    uint256 _unswapped = _calculateUnswapped(_dcaId);

    IERC20Metadata _from = IERC20Metadata(_userPositions[_dcaId].from);
    IERC20Metadata _to = _getTo(_dcaId);
    _removePosition(_dcaId);
    _burn(_dcaId);

    if (_swapped > 0) {
      _balances[address(_to)] -= _swapped;
      _to.safeTransfer(_recipientSwapped, _swapped);
    }

    if (_unswapped > 0) {
      _balances[address(_from)] -= _unswapped;
      _from.safeTransfer(_recipientUnswapped, _unswapped);
    }

    emit Terminated(msg.sender, _recipientUnswapped, _recipientSwapped, _dcaId, _unswapped, _swapped);
  }

  function modifyRate(uint256 _dcaId, uint160 _newRate) external override nonReentrant {
    _assertPositionExistsAndCanBeOperatedByCaller(_dcaId);
    // TODO: Avoid revert here when finalSwap < performedSwaps
    uint32 _swapsLeft = _userPositions[_dcaId].finalSwap -
      performedSwaps.getValue(_userPositions[_dcaId].from, _userPositions[_dcaId].to, _userPositions[_dcaId].swapInterval);
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
    uint256 _positionId,
    uint256 _amount,
    uint32 _newAmountOfSwaps
  ) external override nonReentrant {
    _modify(_positionId, _amount, _newAmountOfSwaps, true);
  }

  function removeFundsFromPosition(
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
    if (_amount == 0) revert ZeroAmount();
    if (_newAmountOfSwaps == 0) revert ZeroSwaps();
    _assertPositionExistsAndCanBeOperatedByCaller(_positionId);

    DCA memory _userDCA = _userPositions[_positionId];

    uint32 _performedSwaps = performedSwaps.getValue(_userDCA.from, _userDCA.to, _userDCA.swapInterval);
    uint160 _newRate;
    if (_newAmountOfSwaps > 0) {
      uint256 _unswapped = (_userDCA.finalSwap <= _performedSwaps) ? 0 : (_userDCA.finalSwap - _performedSwaps) * _userDCA.rate;
      uint256 _total = _increase ? _unswapped + _amount : _unswapped - _amount;
      _newRate = uint160(_total / _newAmountOfSwaps);
    }

    uint256 _swapped = _calculateSwapped(_userDCA);
    if (_swapped > type(uint248).max) revert MandatoryWithdraw(); // You should withdraw before modifying, to avoid losing funds

    _removeFromDelta(_userDCA.from, _userDCA.to, _userDCA.swapInterval, _performedSwaps, _userDCA.finalSwap, int160(_userDCA.rate));
    uint32 _startingSwap = _performedSwaps + 1;
    uint32 _finalSwap = _performedSwaps + _newAmountOfSwaps;
    _addToDelta(_userDCA.from, _userDCA.to, _userDCA.swapInterval, _startingSwap, _finalSwap, int160(_newRate));

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
    address _from = _userPositions[_dcaId].from;
    address _to = _userPositions[_dcaId].to;

    uint256 _swapped = _calculateSwapped(_dcaId);
    if (_swapped > type(uint248).max) revert MandatoryWithdraw(); // You should withdraw before modifying, to avoid losing funds

    uint32 _swapInterval = _userPositions[_dcaId].swapInterval;
    _removePosition(_dcaId);
    (uint32 _startingSwap, uint32 _finalSwap) = _addPosition(_dcaId, _from, _to, _newRate, _newAmountOfSwaps, uint248(_swapped), _swapInterval);

    if (_totalNecessary > _unswapped) {
      // We need to ask for more funds
      IERC20Metadata(_from).safeTransferFrom(msg.sender, address(this), _totalNecessary - _unswapped);
      _balances[_from] += _totalNecessary - _unswapped;
    } else if (_totalNecessary < _unswapped) {
      // We need to return to the owner the amount that won't be used anymore
      _balances[_from] -= _unswapped - _totalNecessary;
      IERC20Metadata(_from).safeTransfer(msg.sender, _unswapped - _totalNecessary);
    }

    emit Modified(msg.sender, _dcaId, _newRate, _startingSwap, _finalSwap);
  }

  function _assertPositionExistsAndCanBeOperatedByCaller(uint256 _dcaId) internal view {
    if (_userPositions[_dcaId].rate == 0) revert InvalidPosition();
    if (!_isApprovedOrOwner(msg.sender, _dcaId)) revert UnauthorizedCaller();
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
    if (_rate == 0) revert ZeroRate();
    uint32 _performedSwaps = performedSwaps.getValue(_from, _to, _swapInterval);
    _startingSwap = _performedSwaps + 1;
    _finalSwap = _performedSwaps + _amountOfSwaps;
    swapAmountDelta[_from][_to][_swapInterval][_startingSwap] += int160(_rate);
    swapAmountDelta[_from][_to][_swapInterval][_finalSwap + 1] -= int160(_rate);
    _userPositions[_dcaId] = DCA(_performedSwaps, _finalSwap, _swapInterval, _rate, _from, _to, _swappedBeforeModified);
  }

  function _removePosition(uint256 _dcaId) internal {
    DCA memory _userDCA = _userPositions[_dcaId];
    uint32 _swapInterval = _userDCA.swapInterval;
    uint32 _finalSwap = _userDCA.finalSwap;
    address _from = _userDCA.from;
    address _to = _userDCA.to;
    uint32 _performedSwaps = performedSwaps.getValue(_from, _to, _swapInterval);

    if (_finalSwap > _performedSwaps) {
      int160 _rate = int160(_userDCA.rate);

      swapAmountDelta[_from][_to][_swapInterval][_performedSwaps + 1] -= _rate;
      swapAmountDelta[_from][_to][_swapInterval][_finalSwap + 1] += _rate;
    }
    delete _userPositions[_dcaId];
  }

  function _addToDelta(
    address _from,
    address _to,
    uint32 _swapInterval,
    uint32 _startingSwap,
    uint32 _finalSwap,
    int160 _rate
  ) internal {
    swapAmountDelta[_from][_to][_swapInterval][_startingSwap] += _rate;
    swapAmountDelta[_from][_to][_swapInterval][_finalSwap + 1] -= _rate;
  }

  function _removeFromDelta(
    address _from,
    address _to,
    uint32 _swapInterval,
    uint32 _performedSwaps,
    uint32 _finalSwap,
    int160 _rate
  ) internal {
    if (_finalSwap > _performedSwaps) {
      swapAmountDelta[_from][_to][_swapInterval][_performedSwaps + 1] -= _rate;
      swapAmountDelta[_from][_to][_swapInterval][_finalSwap + 1] += _rate;
    }
  }

  /** Returns the amount of tokens swapped in TO */
  function _calculateSwapped(uint256 _dcaId) internal view returns (uint256 _swapped) {
    _swapped = _calculateSwapped(_userPositions[_dcaId]);
  }

  function _calculateSwapped(DCA memory _userDCA) internal view returns (uint256 _swapped) {
    uint32 _performedSwaps = performedSwaps.getValue(_userDCA.from, _userDCA.to, _userDCA.swapInterval);
    uint32 _newestSwapToConsider = _performedSwaps < _userDCA.finalSwap ? _performedSwaps : _userDCA.finalSwap;

    if (_userDCA.swapWhereLastUpdated > _newestSwapToConsider) {
      // If last update happened after the position's final swap, then a withdraw was executed, and we just return 0
      return 0;
    } else if (_userDCA.swapWhereLastUpdated == _newestSwapToConsider) {
      // If the last update matches the positions's final swap, then we can avoid all calculation below
      return _userDCA.swappedBeforeModified;
    }

    uint256 _accumRatiosFinalSwap = accumRatio[_userDCA.from][_userDCA.to][_userDCA.swapInterval][_newestSwapToConsider];
    uint256 _accumPerUnit = _accumRatiosFinalSwap - accumRatio[_userDCA.from][_userDCA.to][_userDCA.swapInterval][_userDCA.swapWhereLastUpdated];
    uint256 _magnitude = 10**IERC20Metadata(_userDCA.from).decimals();
    (bool _ok, uint256 _mult) = Math.tryMul(_accumPerUnit, _userDCA.rate);
    uint256 _swappedInCurrentPosition = _ok ? _mult / _magnitude : (_accumPerUnit / _magnitude) * _userDCA.rate;
    _swapped = _swappedInCurrentPosition + _userDCA.swappedBeforeModified;
  }

  /** Returns how many FROM remains unswapped  */
  // TODO: See if we can in-line this in other methods
  function _calculateUnswapped(uint256 _dcaId) internal view returns (uint256 _unswapped) {
    uint32 _performedSwaps = performedSwaps.getValue(
      _userPositions[_dcaId].from,
      _userPositions[_dcaId].to,
      _userPositions[_dcaId].swapInterval
    );
    uint32 _finalSwap = _userPositions[_dcaId].finalSwap;

    if (_finalSwap <= _performedSwaps) return 0;
    _unswapped = (_finalSwap - _performedSwaps) * _userPositions[_dcaId].rate;
  }

  function _getTo(uint256 _dcaId) internal view returns (IERC20Metadata _to) {
    _to = IERC20Metadata(_userPositions[_dcaId].to);
  }
}
