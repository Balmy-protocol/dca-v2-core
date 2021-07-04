//SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.4;

import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '../../interfaces/IERC20Detailed.sol';
import './MAPParameters.sol';

abstract contract MAPPositionHandler is MAPParameters, IMAPPositionHandler {
  using SafeERC20 for IERC20Detailed;
  using EnumerableSet for EnumerableSet.AddressSet;

  struct PairPosition {
    uint256 shares;
    uint104 ratioB; // Determines how much of the liquidity added was in token B
  }

  struct PairData {
    address tokenA;
    address tokenB;
  }

  uint104 internal constant _POSITION_RATIO_PRECISION = 1e30;

  mapping(address => uint256) internal _totalShares; // pair => total shares
  mapping(address => mapping(address => PairPosition)) internal _positions; // pair => owner => position

  function deposit(
    address _pair,
    uint256 _amountTokenA,
    uint256 _amountTokenB
  ) public override {
    PairData memory _pairData = _getPairData(_pair);

    IERC20Detailed(_pairData.tokenA).safeTransferFrom(msg.sender, address(this), _amountTokenA);
    IERC20Detailed(_pairData.tokenB).safeTransferFrom(msg.sender, address(this), _amountTokenB);

    uint256 _ratioFromAToB = _fetchRatio();
    uint256 _liquidity = _amountTokenA * _ratioFromAToB + _amountTokenB;
    require(_liquidity > 0, 'MAP: Deposited liquidity must be positive'); // TODO: Change to Error

    uint256 _totalLiquidity = liquidity[_pair].amountTokenA * _ratioFromAToB + liquidity[_pair].amountTokenB;
    uint256 _shares = _totalShares[_pair] == 0 ? _liquidity : (_liquidity * _totalShares[_pair]) / _totalLiquidity; // TODO: Analyze overflow or round to zero
    uint104 _ratioB = uint104((_amountTokenB * _POSITION_RATIO_PRECISION) / _liquidity); // TODO: Analyze overflow or round to zero

    // Create position
    _positions[_pair][msg.sender] = PairPosition({ratioB: _ratioB, shares: _shares});

    // Update liquidity
    liquidity[_pair].amountTokenA += _amountTokenA;
    liquidity[_pair].amountTokenB += _amountTokenB;

    // Update shares
    _totalShares[_pair] += _shares;

    // Add to active pairs
    _pairsWithLiquidity.add(_pair);

    emit Deposited(msg.sender, _pair, _amountTokenA, _amountTokenB);
  }

  function calculateOwned(address _pair, address _owner) public view override returns (uint256 _ownedTokenA, uint256 _ownedTokenB) {
    PairPosition memory _position = _positions[_pair][_owner];

    require(_position.shares > 0, 'MAP: Invalid position id'); // TODO: Change to error

    uint256 _amountTokenA = liquidity[_pair].amountTokenA;
    uint256 _amountTokenB = liquidity[_pair].amountTokenB;

    uint256 _ratioFromAToB = _fetchRatio();
    uint256 _totalLiquidity = _amountTokenA * _ratioFromAToB + _amountTokenB; // TODO: evaluate how to choose if base token should be A or B. Now it's always B
    uint256 _ownedLiquidity = (_totalLiquidity * _position.shares) / _totalShares[_pair]; // TODO: Analyze overflow or round to zero

    _ownedTokenA = (_ownedLiquidity * (_POSITION_RATIO_PRECISION - _position.ratioB)) / _POSITION_RATIO_PRECISION / _ratioFromAToB; // TODO: this workes only when decimals(tokenA) = decimals(tokenB). When we integrate with oracle, we will need to change this. // TODO: Analyze overflow or round to zero
    _ownedTokenB = (_ownedLiquidity * _position.ratioB) / _POSITION_RATIO_PRECISION; // TODO: Analyze overflow or round to zero

    if (_ownedTokenA > _amountTokenA) {
      uint256 _diff = _ownedTokenA - _amountTokenA;
      _ownedTokenA = _amountTokenA;
      _ownedTokenB += _diff * _ratioFromAToB;
    } else if (_ownedTokenB > _amountTokenB) {
      uint256 _diff = _ownedTokenB - _amountTokenB;
      _ownedTokenA += _diff / _ratioFromAToB;
      _ownedTokenB = _amountTokenB;
    }
  }

  /** Returns the ratio from tokenA to tokenB */
  function _fetchRatio() internal view virtual returns (uint256 _ratioFromAToB) {
    // TODO
  }

  function _getPairData(address _pair) internal view virtual returns (PairData memory _pairData) {
    // TODO
  }
}
