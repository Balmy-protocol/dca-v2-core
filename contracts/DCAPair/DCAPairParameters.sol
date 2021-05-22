// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

import 'hardhat/console.sol';

import '../utils/Math.sol';
import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

import '../DCAFactory/DCAFactory.sol';
import '../interfaces/IERC20Detailed.sol';

interface IDCAPairParameters {
  struct DCA {
    uint32 lastWithdrawSwap;
    uint32 lastSwap;
    uint192 rate;
    bool fromTokenA;
    uint248 swappedBeforeModified;
  }

  /* Public getters */
  function factory() external view returns (IDCAFactory);

  // solhint-disable-next-line func-name-mixedcase
  function FEE_PRECISION() external view returns (uint24);

  function tokenA() external view returns (IERC20Detailed);

  function tokenB() external view returns (IERC20Detailed);

  function swapAmountDelta(address, uint32) external view returns (int256);

  // TODO: When we reduce contract's size, make this a little bit more useful
  function userPositions(uint256)
    external
    returns (
      uint32,
      uint32,
      uint192,
      bool,
      uint248
    );

  function performedSwaps() external returns (uint32);
}

abstract contract DCAPairParameters is IDCAPairParameters {
  uint24 public constant override FEE_PRECISION = 10000; // TODO: Take from factory in initiation

  // Internal constants
  uint256 internal _magnitudeA;
  uint256 internal _magnitudeB;

  // Basic setup
  IDCAFactory public override factory;
  IERC20Detailed public override tokenA;
  IERC20Detailed public override tokenB;

  // Tracking
  mapping(address => mapping(uint32 => int256)) public override swapAmountDelta;
  mapping(uint256 => DCA) public override userPositions;
  uint32 public override performedSwaps; // Note: If we had swaps every minute, for 100 years, uint32 would still cover it
  mapping(address => mapping(uint32 => uint256[2])) internal _accumRatesPerUnit;

  constructor(
    IDCAFactory _factory,
    IERC20Detailed _tokenA,
    IERC20Detailed _tokenB
  ) {
    require(address(_factory) != address(0), 'DCAPair: zero address');
    require(address(_tokenA) != address(0), 'DCAPair: zero address');
    require(address(_tokenB) != address(0), 'DCAPair: zero address');
    factory = _factory;
    tokenA = _tokenA;
    tokenB = _tokenB;
    _magnitudeA = 10**_tokenA.decimals();
    _magnitudeB = 10**_tokenB.decimals();
  }

  function _getFeeFromAmount(uint256 _amount) internal view returns (uint256) {
    uint32 _protocolFee = factory.fee();
    (bool _ok, uint256 _fee) = Math.tryMul(_amount, _protocolFee);
    if (_ok) {
      _fee = _fee / FEE_PRECISION / 100;
    } else {
      _fee = (_protocolFee < FEE_PRECISION) ? ((_amount / FEE_PRECISION) * _protocolFee) / 100 : (_amount / FEE_PRECISION / 100) * _protocolFee;
    }
    return _fee;
  }
}
