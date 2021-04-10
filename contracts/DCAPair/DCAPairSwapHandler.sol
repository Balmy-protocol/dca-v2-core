//SPDX-License-Identifier: Unlicense
pragma solidity 0.7.0;

import 'hardhat/console.sol';

import '../SlidingOracle.sol';
import './DCAPairParameters.sol';

interface IDCAPairSwapHandler {
  event OracleSet(ISlidingOracle _oracle);

  event SwapIntervalSet(uint256 _swapInterval);

  event Swapped(
    uint256 _swapToPerform,
    uint256 _amountToSwapTokenA,
    uint256 _amountToSwapTokenB,
    uint256 _ratePerUnitBToA,
    uint256 _ratePerUnitAToB,
    uint256 _amountToBeProvidedExternally,
    IERC20Decimals _tokenToBeProvidedExternally
  );

  function swapInterval() external returns (uint256);

  function lastSwapPerformed() external returns (uint256);

  function swapAmountAccumulator(address) external returns (uint256);

  function performedSwaps() external returns (uint256);

  function oracle() external returns (ISlidingOracle);

  function setOracle(ISlidingOracle _oracle) external;

  function setSwapInterval(uint256 _swapInterval) external;

  function getNextSwapInfo()
    external
    view
    returns (
      uint256 _swapToPerform,
      uint256 _amountToSwapTokenA,
      uint256 _amountToSwapTokenB,
      uint256 _ratePerUnitBToA,
      uint256 _ratePerUnitAToB,
      uint256 _amountToBeProvidedExternally,
      IERC20Decimals _tokenToBeProvidedExternally
    );

  function swap() external;
}

abstract contract DCAPairSwapHandler is DCAPairParameters, IDCAPairSwapHandler {
  using SafeERC20 for IERC20Decimals;
  using SafeMath for uint256;
  using SignedSafeMath for int256;

  uint256 internal constant _MINIMUM_SWAP_INTERVAL = 1 minutes;

  mapping(address => uint256) public override swapAmountAccumulator;
  uint256 public override swapInterval;
  uint256 public override lastSwapPerformed;
  uint256 public override performedSwaps;
  ISlidingOracle public override oracle;

  constructor(
    IDCAFactory _factory,
    ISlidingOracle _oracle,
    uint256 _swapInterval
  ) {
    _setFactory(_factory);
    _setOracle(_oracle);
    _setSwapInterval(_swapInterval);
  }

  function _setOracle(ISlidingOracle _oracle) internal {
    require(address(_oracle) != address(0), 'DCAPair: zero-address');
    oracle = _oracle;
    emit OracleSet(_oracle);
  }

  function _setSwapInterval(uint256 _swapInterval) internal {
    require(_swapInterval >= _MINIMUM_SWAP_INTERVAL, 'DCAPair: interval too short');
    swapInterval = _swapInterval;
    emit SwapIntervalSet(_swapInterval);
  }

  function _addNewRatePerUnit(
    address _address,
    uint256 _performedSwap,
    uint256 _ratePerUnit
  ) internal {
    uint256 _previousSwap = _performedSwap - 1;
    if (accumRatesPerUnit[_address][_previousSwap][0] + _ratePerUnit < accumRatesPerUnit[_address][_previousSwap][0]) {
      uint256 _missingUntilOverflow = type(uint256).max.sub(accumRatesPerUnit[_address][_previousSwap][0]);
      accumRatesPerUnit[_address][_performedSwap] = [
        _ratePerUnit.sub(_missingUntilOverflow),
        accumRatesPerUnit[_address][_previousSwap][1].add(1)
      ];
    } else {
      accumRatesPerUnit[_address][_performedSwap] = [
        accumRatesPerUnit[_address][_previousSwap][0].add(_ratePerUnit),
        accumRatesPerUnit[_address][_previousSwap][1]
      ];
    }
  }

  function _registerSwap(
    address _token,
    uint256 _internalAmountUsedToSwap,
    uint256 _ratePerUnit,
    uint256 _swapToRegister
  ) internal {
    swapAmountAccumulator[_token] = _internalAmountUsedToSwap;
    _addNewRatePerUnit(_token, _swapToRegister, _ratePerUnit);
    delete swapAmountDelta[_token][_swapToRegister];
  }

  function _getAmountToSwap(address _address, uint256 _swapToPerform) internal view returns (uint256 _swapAmountAccumulator) {
    _swapAmountAccumulator = swapAmountAccumulator[_address] + uint256(swapAmountDelta[_address][_swapToPerform]);
  }

  function getNextSwapInfo()
    public
    view
    override
    returns (
      uint256 _swapToPerform,
      uint256 _amountToSwapTokenA,
      uint256 _amountToSwapTokenB,
      uint256 _ratePerUnitBToA,
      uint256 _ratePerUnitAToB,
      uint256 _amountToBeProvidedExternally,
      IERC20Decimals _tokenToBeProvidedExternally
    )
  {
    _swapToPerform = performedSwaps.add(1);
    _amountToSwapTokenA = _getAmountToSwap(address(tokenA), _swapToPerform);
    _amountToSwapTokenB = _getAmountToSwap(address(tokenB), _swapToPerform);
    // TODO: Instead of using current, it should use quote to get a moving average and not current?
    _ratePerUnitBToA = oracle.current(address(tokenB), 10**tokenA.decimals(), address(tokenA));
    // 1eDecimalsB    - 1.23e17 As
    // X              - 1eDecimalsA
    _ratePerUnitAToB = (10**tokenA.decimals()).mul(10**tokenB.decimals()).div(_ratePerUnitBToA);

    // 1eDecimalsB        - 1.2e17 As
    // amountToSwapTokenB - X
    // => X = amountToSwapTokenBs * ratePerUnitBToA / 1eDecimalsB
    uint256 _amountOfTokenAIfTokenBSwapped = _amountToSwapTokenB.mul(_ratePerUnitBToA).div(10**tokenB.decimals());

    // CASE A
    // # token a to swap = 500
    // # token b to swap = 350
    // tokenA = 1.05 tokenB
    // => token b would give us = 367.5 token a
    // => we have a surplus of (500 - 367.5) = 132.5 token a's in the trade.
    // => we need more token B's to be provided externally for this to be fair
    // => at the same rate we would need (132.5 / 1.05) = 126.19047619 token B to be provided from an external source

    // CASE B
    // # token a to swap = 500
    // # token b to swap = 650
    // tokenA = 1.05 tokenB
    // => token b would give us = 619.047619048 token a
    // we are missing (619.047619048 - 500) = 119.047619048 token a's in trade.

    if (_amountOfTokenAIfTokenBSwapped < _amountToSwapTokenA) {
      uint256 _tokenASurplus = _amountToSwapTokenA.sub(_amountOfTokenAIfTokenBSwapped);
      _tokenToBeProvidedExternally = tokenB;
      // 1eDecimalsB  - 1.2e17 As
      // X            - surplus As
      // X = surplusAs * 1eDecimalsB / ratePerUnitBToA
      _amountToBeProvidedExternally = _tokenASurplus.mul(10**tokenB.decimals()).div(_ratePerUnitBToA);
    } else if (_amountOfTokenAIfTokenBSwapped > _amountToSwapTokenA) {
      _tokenToBeProvidedExternally = tokenA;
      _amountToBeProvidedExternally = _amountOfTokenAIfTokenBSwapped.sub(_amountToSwapTokenA);
    } else {
      _amountToBeProvidedExternally = 0;
      _tokenToBeProvidedExternally = IERC20Decimals(address(0));
    }
  }

  function _swap() internal {
    require(lastSwapPerformed <= block.timestamp.sub(swapInterval), 'DCAPair: within swap interval');
    (
      uint256 _swapToPerform,
      uint256 _amountToSwapTokenA,
      uint256 _amountToSwapTokenB,
      uint256 _ratePerUnitBToA,
      uint256 _ratePerUnitAToB,
      uint256 _amountToBeProvidedExternally,
      IERC20Decimals _tokenToBeProvidedExternally
    ) = getNextSwapInfo();
    if (_amountToBeProvidedExternally > 0) {
      _tokenToBeProvidedExternally.safeTransferFrom(msg.sender, address(this), _amountToBeProvidedExternally);
    }
    _registerSwap(address(tokenA), _amountToSwapTokenA, _ratePerUnitAToB, _swapToPerform);
    _registerSwap(address(tokenB), _amountToSwapTokenB, _ratePerUnitBToA, _swapToPerform);
    performedSwaps = _swapToPerform;
    lastSwapPerformed = block.timestamp;
    emit Swapped(
      _swapToPerform,
      _amountToSwapTokenA,
      _amountToSwapTokenB,
      _ratePerUnitBToA,
      _ratePerUnitAToB,
      _amountToBeProvidedExternally,
      _tokenToBeProvidedExternally
    );
  }
}
