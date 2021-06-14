// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.8.4;

import './IDCAGlobalParameters.sol';
import './IERC20Detailed.sol';
import './ISlidingOracle.sol';

interface IDCAPairParameters {
  /* Public getters */
  function globalParameters() external view returns (IDCAGlobalParameters);

  function tokenA() external view returns (IERC20Detailed);

  function tokenB() external view returns (IERC20Detailed);

  function swapAmountDelta(
    uint32,
    address,
    uint32
  ) external view returns (int256);

  function performedSwaps(uint32) external view returns (uint32);
}

interface IDCAPairPositionHandler {
  struct DCA {
    uint32 lastWithdrawSwap;
    uint32 lastSwap;
    uint32 swapInterval; // TODO: remove 32 bits from somewhere else
    uint192 rate;
    bool fromTokenA;
    uint248 swappedBeforeModified;
  }

  event Terminated(address indexed _user, uint256 _dcaId, uint256 _returnedUnswapped, uint256 _returnedSwapped);
  event Deposited(
    address indexed _user,
    uint256 _dcaId,
    address _fromToken,
    uint192 _rate,
    uint32 _startingSwap,
    uint32 _swapInterval,
    uint32 _lastSwap
  );
  event Withdrew(address indexed _user, uint256 _dcaId, address _token, uint256 _amount);
  event WithdrewMany(address indexed _user, uint256[] _dcaIds, uint256 _swappedTokenA, uint256 _swappedTokenB);
  event Modified(address indexed _user, uint256 _dcaId, uint192 _rate, uint32 _startingSwap, uint32 _lastSwap);

  function userPosition(uint256) external view returns (DCA memory);

  function deposit(
    address _tokenAddress,
    uint192 _rate,
    uint32 _amountOfSwaps,
    uint32 _swapInterval
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
  struct Swap {
    uint32 interval;
    uint32 swapToPerform;
  }
  struct NextSwapInformation {
    Swap[] swapsToPerform;
    uint256 amountToSwapTokenA;
    uint256 amountToSwapTokenB;
    uint256 availableToBorrowTokenA;
    uint256 availableToBorrowTokenB;
    uint256 ratePerUnitBToA;
    uint256 ratePerUnitAToB;
    uint256 platformFeeTokenA;
    uint256 platformFeeTokenB;
    uint256 amountToBeProvidedBySwapper;
    uint256 amountToRewardSwapperWith;
    IERC20Detailed tokenToBeProvidedBySwapper;
    IERC20Detailed tokenToRewardSwapperWith;
  }

  event Swapped(
    address indexed _sender,
    address indexed _to,
    uint256 _amountBorrowedTokenA,
    uint256 _amountBorrowedTokenB,
    NextSwapInformation _nextSwapInformation
  );

  function lastSwapPerformed(uint32) external view returns (uint32);

  function swapAmountAccumulator(uint32, address) external view returns (uint256);

  function oracle() external returns (ISlidingOracle);

  function getNextSwapInfo() external view returns (NextSwapInformation memory _nextSwapInformation);

  function swap() external;

  function swap(
    uint256 _amountToBorrowTokenA,
    uint256 _amountToBorrowTokenB,
    address _to,
    bytes calldata _data
  ) external;
}

interface IDCAPairLoanHandler {
  event Loaned(address indexed _sender, address indexed _to, uint256 _amountBorrowedTokenA, uint256 _amountBorrowedTokenB, uint32 _loanFee);

  function loan(
    uint256 _amountToBorrowTokenA,
    uint256 _amountToBorrowTokenB,
    address _to,
    bytes memory _data
  ) external;
}

interface IDCAPair is IDCAPairParameters, IDCAPairSwapHandler, IDCAPairPositionHandler, IDCAPairLoanHandler {}
