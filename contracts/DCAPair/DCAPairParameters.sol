// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

import 'hardhat/console.sol';

import './utils/Math.sol';
import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

import '../DCAFactory/DCAFactory.sol';
import '../interfaces/IERC20Detailed.sol';

interface IDCAPairParameters {
  struct DCA {
    address from;
    uint256 rate;
    uint256 lastWithdrawSwap;
    uint256 lastSwap;
    uint256 swappedBeforeModified;
  }

  /* Events */
  event TokenASet(IERC20Detailed _tokenA);
  event TokenBSet(IERC20Detailed _tokenB);
  event FactorySet(IDCAFactory _factory);

  /* Public getters */
  function factory() external view returns (IDCAFactory);

  function FEE_PRECISION() external view returns (uint256);

  function tokenA() external view returns (IERC20Detailed);

  function tokenB() external view returns (IERC20Detailed);

  function swapAmountDelta(address, uint256) external view returns (int256);

  function userPositions(uint256)
    external
    returns (
      address,
      uint256,
      uint256,
      uint256,
      uint256
    );

  function performedSwaps() external returns (uint256);
}

abstract contract DCAPairParameters is IDCAPairParameters {
  uint256 public constant override FEE_PRECISION = 10000; // TODO: Take from factory in initiation

  // Internal constants
  uint256 internal _magnitudeA;
  uint256 internal _magnitudeB;

  // Basic setup
  IDCAFactory public override factory;
  IERC20Detailed public override tokenA;
  IERC20Detailed public override tokenB;

  // Tracking
  mapping(address => mapping(uint256 => int256)) public override swapAmountDelta;
  mapping(uint256 => DCA) public override userPositions;
  uint256 public override performedSwaps;
  mapping(address => mapping(uint256 => uint256[2])) internal _accumRatesPerUnit;

  constructor(
    IDCAFactory _factory,
    IERC20Detailed _tokenA,
    IERC20Detailed _tokenB
  ) {
    _setFactory(_factory);
    _setTokenA(_tokenA);
    _setTokenB(_tokenB);
  }

  function _setFactory(IDCAFactory _factory) internal {
    require(address(_factory) != address(0), 'DCAPair: zero address');
    factory = _factory;
    emit FactorySet(_factory);
  }

  function _setTokenA(IERC20Detailed _tokenA) internal {
    require(address(_tokenA) != address(0), 'DCAPair: zero address');
    tokenA = _tokenA;
    _magnitudeA = 10**_tokenA.decimals();
    emit TokenASet(_tokenA);
  }

  function _setTokenB(IERC20Detailed _tokenB) internal {
    require(address(_tokenB) != address(0), 'DCAPair: zero address');
    tokenB = _tokenB;
    _magnitudeB = 10**_tokenB.decimals();
    emit TokenBSet(_tokenB);
  }

  function _getFeeFromAmount(uint256 _amount) internal view returns (uint256) {
    uint256 _protocolFee = factory.fee();
    (bool _ok, uint256 _fee) = Math.tryMul(_amount, _protocolFee);
    if (_ok) {
      _fee = _fee / FEE_PRECISION / 100;
    } else {
      _fee = (_protocolFee < FEE_PRECISION) ? ((_amount / FEE_PRECISION) * _protocolFee) / 100 : (_amount / FEE_PRECISION / 100) * _protocolFee;
    }
    return _fee;
  }
}
