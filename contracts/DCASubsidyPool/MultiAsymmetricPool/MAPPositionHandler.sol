//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

import './MAPParameters.sol';

interface IMAPPositionHandler {
  struct PoolPosition {
    address pair;
    uint256 shares;
    uint104 ratioB; // Determines how much of the liquidity added was in token B
  }

  event Deposited(address indexed _user, address _pair, uint256 _amountTokenA, uint256 _amountTokenB, uint256 _positionId, uint256 _shares);

  // solhint-disable-next-line func-name-mixedcase
  function POSITION_RATIO_PRECISION() external view returns (uint104);

  function deposit(
    address _pair,
    uint256 _amountTokenA,
    uint256 _amountTokenB
  ) external returns (uint256 _positionId);

  function calculateOwned(uint256 _positionId) external view returns (uint256 _amountTokenA, uint256 _amountTokenB);

  function totalShares(address _pair) external view returns (uint256 _totalShares);

  function positions(uint256 _positionId)
    external
    view
    returns (
      address _pair,
      uint256 _shares,
      uint104 _ratioFromAToBB
    );
}

abstract contract MAPPositionHandler is IMAPPositionHandler, MAPParameters {
  using SafeERC20 for IERC20Detailed;

  // solhint-disable-next-line var-name-mixedcase
  uint104 public override POSITION_RATIO_PRECISION = 10**30;

  mapping(address => uint256) public override totalShares;
  mapping(uint256 => PoolPosition) public override positions;

  uint256 private _counter;

  // TODO: remove and actually call oracle
  uint256 internal _oracleRatioFromAToB;

  function _deposit(
    address _pair,
    uint256 _amountTokenA,
    uint256 _amountTokenB
  ) internal returns (uint256 _positionId) {
    PairData memory _pairData = _getPairData(_pair);

    IERC20Detailed(_pairData.tokenA).safeTransferFrom(msg.sender, address(this), _amountTokenA);
    IERC20Detailed(_pairData.tokenB).safeTransferFrom(msg.sender, address(this), _amountTokenB);

    uint256 _ratioFromAToB = _fetchRatio();
    uint256 _liquidity = _amountTokenA * _ratioFromAToB + _amountTokenB;
    require(_liquidity > 0, 'MAP: Deposited liquidity must be positive');

    uint256 _totalLiquidity = liquidity[_pair].tokenA * _ratioFromAToB + liquidity[_pair].tokenB;
    uint256 _shares = totalShares[_pair] == 0 ? _liquidity : (_liquidity * totalShares[_pair]) / _totalLiquidity;
    uint104 _ratioB = uint104((_amountTokenB * POSITION_RATIO_PRECISION) / _liquidity); // TODO: Check for overflow or reduced to zero

    // Create position
    _positionId = ++_counter;
    positions[_positionId] = PoolPosition({pair: _pair, ratioB: _ratioB, shares: _shares});

    // Update liquidity
    liquidity[_pair].tokenA += _amountTokenA;
    liquidity[_pair].tokenB += _amountTokenB;

    // Update shares
    totalShares[_pair] += _shares;

    emit Deposited(msg.sender, _pair, _amountTokenA, _amountTokenB, _positionId, _shares);
  }

  function _calculateOwned(uint256 _positionId) internal view returns (uint256 _amountTokenA, uint256 _amountTokenB) {
    PoolPosition memory _position = positions[_positionId];

    require(_position.shares > 0, 'MAP: Invalid position id');

    uint256 _ratioFromAToB = _fetchRatio();
    uint256 _totalLiquidity = liquidity[_position.pair].tokenA * _ratioFromAToB + liquidity[_position.pair].tokenB; // TODO: evaluate how to choose if base token should be A or B. Now it's always B
    uint256 _ownedLiquidity = (_totalLiquidity * _position.shares) / totalShares[_position.pair];

    _amountTokenA = (_ownedLiquidity * (POSITION_RATIO_PRECISION - _position.ratioB)) / POSITION_RATIO_PRECISION / _ratioFromAToB; // TODO: this workes only when decimals(tokenA) = decimals(tokenB). When we integrate with oracle, we will need to change this
    _amountTokenB = (_ownedLiquidity * _position.ratioB) / POSITION_RATIO_PRECISION;

    if (_amountTokenA > liquidity[_position.pair].tokenA) {
      uint256 _diff = _amountTokenA - liquidity[_position.pair].tokenA;
      _amountTokenA = liquidity[_position.pair].tokenA;
      _amountTokenB += _diff * _ratioFromAToB;
    } else if (_amountTokenB > liquidity[_position.pair].tokenB) {
      uint256 _diff = _amountTokenB - liquidity[_position.pair].tokenB;
      _amountTokenA += _diff / _ratioFromAToB;
      _amountTokenB = liquidity[_position.pair].tokenB;
    }
  }

  /** Returns the ratio from tokenA to tokenB */
  function _fetchRatio() private view returns (uint256 _ratioFromAToB) {
    _ratioFromAToB = _oracleRatioFromAToB;
  }
}
