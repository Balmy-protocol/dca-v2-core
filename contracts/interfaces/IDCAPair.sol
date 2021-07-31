// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.8.4;

import './IDCAGlobalParameters.sol';
import './IERC20Detailed.sol';

/// @title The interface for all state related queries
/// @notice These methods allow users to read the pair's current values
interface IDCAPairParameters {
  /// @notice Returns the global parameters contract
  /// @dev Global parameters has information about swaps and pairs, like swap intervals, fees charged, etc.
  /// @return The Global Parameters contract
  function globalParameters() external view returns (IDCAGlobalParameters);

  /// @notice Returns the token A contract
  /// @return The contract for token A
  function tokenA() external view returns (IERC20Detailed);

  /// @notice Returns the token B contract
  /// @return The contract for token B
  function tokenB() external view returns (IERC20Detailed);

  /// @notice Returns how much will the amount to swap differ from the previous swap
  /// @dev f.e. if the returned value is -100, then the amount to swap will be 100 less than the swap just before it
  /// @param _swapInterval The swap interval to check
  /// @param _from The 'from' token of the deposits
  /// @param _swap The swap number to check
  /// @return _delta How much will the amount to swap differ, when compared to the swap just before this one
  function swapAmountDelta(
    uint32 _swapInterval,
    address _from,
    uint32 _swap
  ) external view returns (int256 _delta);

  /// @notice Returns if a certain swap interval is active or not
  /// @dev We consider a swap interval to be active if there is at least one active position on that interval
  /// @param _swapInterval The swap interval to check
  /// @return _isActive Whether the given swap interval is currently active
  function isSwapIntervalActive(uint32 _swapInterval) external view returns (bool _isActive);

  /// @notice Returns the amount of swaps executed for a certain interval
  /// @param _swapInterval The swap interval to check
  /// @return _swaps The amount of swaps performed on the given interval
  function performedSwaps(uint32 _swapInterval) external view returns (uint32 _swaps);
}

interface IDCAPairPositionHandler is IDCAPairParameters {
  struct UserPosition {
    IERC20Detailed from;
    IERC20Detailed to;
    uint32 swapInterval;
    uint32 swapsExecuted; // Since deposit or last withdraw
    uint256 swapped; // Since deposit or last withdraw
    uint32 swapsLeft;
    uint256 remaining;
    uint160 rate;
  }

  event Terminated(address indexed _user, uint256 _dcaId, uint256 _returnedUnswapped, uint256 _returnedSwapped);
  event Deposited(
    address indexed _user,
    uint256 _dcaId,
    address _fromToken,
    uint160 _rate,
    uint32 _startingSwap,
    uint32 _swapInterval,
    uint32 _lastSwap
  );
  event Withdrew(address indexed _user, uint256 _dcaId, address _token, uint256 _amount);
  event WithdrewMany(address indexed _user, uint256[] _dcaIds, uint256 _swappedTokenA, uint256 _swappedTokenB);
  event Modified(address indexed _user, uint256 _dcaId, uint160 _rate, uint32 _startingSwap, uint32 _lastSwap);

  error InvalidToken();
  error InvalidInterval();
  error InvalidPosition();
  error UnauthorizedCaller();
  error ZeroRate();
  error ZeroSwaps();
  error ZeroAmount();
  error PositionCompleted();
  error MandatoryWithdraw();

  function userPosition(uint256) external view returns (UserPosition memory _position);

  function deposit(
    address _tokenAddress,
    uint160 _rate,
    uint32 _amountOfSwaps,
    uint32 _swapInterval
  ) external returns (uint256 _dcaId);

  function withdrawSwapped(uint256 _dcaId) external returns (uint256 _swapped);

  function withdrawSwappedMany(uint256[] calldata _dcaIds) external returns (uint256 _swappedTokenA, uint256 _swappedTokenB);

  function modifyRate(uint256 _dcaId, uint160 _newRate) external;

  function modifySwaps(uint256 _dcaId, uint32 _newSwaps) external;

  function modifyRateAndSwaps(
    uint256 _dcaId,
    uint160 _newRate,
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
  struct SwapInformation {
    uint32 interval;
    uint32 swapToPerform;
    uint256 amountToSwapTokenA;
    uint256 amountToSwapTokenB;
  }

  struct NextSwapInformation {
    SwapInformation[] swapsToPerform;
    uint8 amountOfSwaps;
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
    uint32 _fee,
    NextSwapInformation _nextSwapInformation
  );

  error NoSwapsToExecute();

  function nextSwapAvailable(uint32) external view returns (uint32);

  function swapAmountAccumulator(uint32, address) external view returns (uint256);

  function getNextSwapInfo() external view returns (NextSwapInformation memory _nextSwapInformation);

  function swap() external;

  function swap(
    uint256 _amountToBorrowTokenA,
    uint256 _amountToBorrowTokenB,
    address _to,
    bytes calldata _data
  ) external;

  function secondsUntilNextSwap() external view returns (uint32);
}

/// @title The interface for all loan related matters in a DCA pair
/// @notice These methods allow users to ask how much is available for loans, and also to execute them
interface IDCAPairLoanHandler {
  /// @notice Emitted when a flash loan is executed
  /// @param _sender The address of the user that initiated the loan
  /// @param _to The address that received the loan
  /// @param _amountBorrowedTokenA How much was borrowed in token A
  /// @param _amountBorrowedTokenB How much was borrowed in token B
  /// @param _loanFee How much was charged as a fee
  event Loaned(address indexed _sender, address indexed _to, uint256 _amountBorrowedTokenA, uint256 _amountBorrowedTokenB, uint32 _loanFee);

  // @notice Thrown when trying to execute a flash loan but without actually asking for tokens
  error ZeroLoan();

  /// @notice Returns the amount of tokens that can be asked for during a flash loan
  /// @return _amountToBorrowTokenA The amount of token A that is available for borrowing
  /// @return _amountToBorrowTokenB The amount of token B that is available for borrowing
  function availableToBorrow() external view returns (uint256 _amountToBorrowTokenA, uint256 _amountToBorrowTokenB);

  /// @notice Executes a flash loan, sending the required amounts to the specified loan recipient
  /// @dev Will revert:
  /// With ZeroLoan if both _amountToBorrowTokenA & _amountToBorrowTokenB are 0
  /// With Paused if loans are paused by protocol
  /// With InsufficientLiquidity if asked for more that reserves
  /// @param _amountToBorrowTokenA The amount to borrow in token A
  /// @param _amountToBorrowTokenB The amount to borrow in token B
  /// @param _to Address that will receive the loan. This address should be a contract that implements IDCAPairLoanCallee
  /// @param _data Any data that should be passed through to the callback
  function loan(
    uint256 _amountToBorrowTokenA,
    uint256 _amountToBorrowTokenB,
    address _to,
    bytes calldata _data
  ) external;
}

interface IDCAPair is IDCAPairParameters, IDCAPairSwapHandler, IDCAPairPositionHandler, IDCAPairLoanHandler {}
