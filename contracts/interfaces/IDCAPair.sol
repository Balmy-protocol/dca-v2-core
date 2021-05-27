// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

import './IDCAGlobalParameters.sol';
import './IERC20Detailed.sol';
import './ISlidingOracle.sol';

interface IDCAPairParameters {
  struct DCA {
    uint32 lastWithdrawSwap;
    uint32 lastSwap;
    uint192 rate;
    bool fromTokenA;
    uint248 swappedBeforeModified;
  }

  /* Public getters */
  function globalParameters() external view returns (IDCAGlobalParameters);

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

interface IDCAPairPositionHandler {
  event Terminated(address indexed _user, uint256 _dcaId, uint256 _returnedUnswapped, uint256 _returnedSwapped);
  event Deposited(address indexed _user, uint256 _dcaId, address _fromToken, uint192 _rate, uint32 _startingSwap, uint32 _lastSwap);
  event Withdrew(address indexed _user, uint256 _dcaId, address _token, uint256 _amount);
  event WithdrewMany(address indexed _user, uint256[] _dcaIds, uint256 _swappedTokenA, uint256 _swappedTokenB);
  event Modified(address indexed _user, uint256 _dcaId, uint192 _rate, uint32 _startingSwap, uint32 _lastSwap);

  function deposit(
    address _tokenAddress,
    uint192 _rate,
    uint32 _amountOfSwaps
  ) external returns (uint256 _dcaId);

  function withdrawSwapped(uint256 _dcaId) external returns (uint256 _swapped);

  function withdrawSwappedMany(uint256[] calldata _dcaIds) external returns (uint256 _swappedTokenA, uint256 _swappedTokenB);

  function modifyRate(uint256 _dcaId, uint192 _newRate) external;

  function modifySwaps(uint256 _dcaId, uint32 _newSwaps) external;

  function modifyRateAndSwaps(
    uint256 _dcaId,
    uint192 _newRate,
    uint32 _newSwaps
  ) external;

  function addFundsToPosition(
    uint256 _dcaId,
    uint256 _amount,
    uint32 _newSwaps
  ) external;

  function terminate(uint256 _dcaId) external;
}

interface IDCAPairSwapHandler {
  struct NextSwapInformation {
    uint32 swapToPerform;
    uint256 amountToSwapTokenA;
    uint256 amountToSwapTokenB;
    uint256 ratePerUnitBToA;
    uint256 ratePerUnitAToB;
    uint256 platformFeeTokenA;
    uint256 platformFeeTokenB;
    uint256 amountToBeProvidedBySwapper;
    uint256 amountToRewardSwapperWith;
    IERC20Detailed tokenToBeProvidedBySwapper;
    IERC20Detailed tokenToRewardSwapperWith;
  }

  event Swapped(NextSwapInformation _nextSwapInformation);

  function swapInterval() external view returns (uint32);

  function lastSwapPerformed() external view returns (uint256);

  function swapAmountAccumulator(address) external view returns (uint256);

  function oracle() external returns (ISlidingOracle);

  function getNextSwapInfo() external view returns (NextSwapInformation memory _nextSwapInformation);

  function swap() external;

  function swap(address _to, bytes calldata _data) external;
}

interface IDCAPair is IDCAPairParameters, IDCAPairSwapHandler, IDCAPairPositionHandler {}
