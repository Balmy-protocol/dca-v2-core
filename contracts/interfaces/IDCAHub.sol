// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';
import '@openzeppelin/contracts/token/ERC721/IERC721.sol';

/// @title The interface for all state related queries
/// @notice These methods allow users to read the pair's current values
interface IDCAHubParameters {
  /// @notice Returns the token A contract
  /// @return The contract for token A
  function tokenA() external view returns (IERC20Metadata);

  /// @notice Returns the token B contract
  /// @return The contract for token B
  function tokenB() external view returns (IERC20Metadata);
}

/// @title The interface for all position related matters in a DCA pair
/// @notice These methods allow users to create, modify and terminate their positions
interface IDCAHubPositionHandler is IDCAHubParameters {
  /// @notice The position of a certain user
  struct UserPosition {
    // The token that the user deposited and will be swapped in exchange for "to"
    IERC20Metadata from;
    // The token that the user will get in exchange for their "from" tokens in each swap
    IERC20Metadata to;
    // How frequently the position's swaps should be executed
    uint32 swapInterval;
    // How many swaps were executed since deposit, last modification, or last withdraw
    uint32 swapsExecuted;
    // How many "to" tokens can currently be withdrawn
    uint256 swapped;
    // How many swaps left the position has to execute
    uint32 swapsLeft;
    // How many "from" tokens there are left to swap
    uint256 remaining;
    // How many "from" tokens need to be traded in each swap
    uint160 rate;
  }

  /// @notice Emitted when a position is terminated
  /// @param user The address of the user that terminated the position
  /// @param recipientUnswapped The address of the user that will receive the unswapped tokens
  /// @param recipientSwapped The address of the user that will receive the swapped tokens
  /// @param dcaId The id of the position that was terminated
  /// @param returnedUnswapped How many "from" tokens were returned to the caller
  /// @param returnedSwapped How many "to" tokens were returned to the caller
  event Terminated(
    address indexed user,
    address indexed recipientUnswapped,
    address indexed recipientSwapped,
    uint256 dcaId,
    uint256 returnedUnswapped,
    uint256 returnedSwapped
  );

  /// @notice Emitted when a position is created
  /// @param depositor The address of the user that creates the position
  /// @param owner The address of the user that will own the position
  /// @param dcaId The id of the position that was created
  /// @param fromToken The address of the "from" token
  /// @param rate How many "from" tokens need to be traded in each swap
  /// @param startingSwap The number of the swap when the position will be executed for the first time
  /// @param swapInterval How frequently the position's swaps should be executed
  /// @param lastSwap The number of the swap when the position will be executed for the last time
  event Deposited(
    address indexed depositor,
    address indexed owner,
    uint256 dcaId,
    address fromToken,
    uint160 rate,
    uint32 startingSwap,
    uint32 swapInterval,
    uint32 lastSwap
  );

  /// @notice Emitted when a user withdraws all swapped tokens from a position
  /// @param withdrawer The address of the user that executed the withdraw
  /// @param recipient The address of the user that will receive the withdrawn tokens
  /// @param dcaId The id of the position that was affected
  /// @param token The address of the withdrawn tokens. It's the same as the position's "to" token
  /// @param amount The amount that was withdrawn
  event Withdrew(address indexed withdrawer, address indexed recipient, uint256 dcaId, address token, uint256 amount);

  /// @notice Emitted when a user withdraws all swapped tokens from many positions
  /// @param withdrawer The address of the user that executed the withdraws
  /// @param recipient The address of the user that will receive the withdrawn tokens
  /// @param dcaIds The ids of the positions that were affected
  /// @param swappedTokenA The total amount that was withdrawn in token A
  /// @param swappedTokenB The total amount that was withdrawn in token B
  event WithdrewMany(address indexed withdrawer, address indexed recipient, uint256[] dcaIds, uint256 swappedTokenA, uint256 swappedTokenB);

  /// @notice Emitted when a position is modified
  /// @param user The address of the user that modified the position
  /// @param dcaId The id of the position that was modified
  /// @param rate How many "from" tokens need to be traded in each swap
  /// @param startingSwap The number of the swap when the position will be executed for the first time
  /// @param lastSwap The number of the swap when the position will be executed for the last time
  event Modified(address indexed user, uint256 dcaId, uint160 rate, uint32 startingSwap, uint32 lastSwap);

  /// @notice Thrown when a user tries to create a position with a token that is neither token A nor token B
  error InvalidToken();

  /// @notice Thrown when a user tries to create that a position with an unsupported swap interval
  error InvalidInterval();

  /// @notice Thrown when a user tries operate on a position that doesn't exist (it might have been already terminated)
  error InvalidPosition();

  /// @notice Thrown when a user tries operate on a position that they don't have access to
  error UnauthorizedCaller();

  /// @notice Thrown when a user tries to create or modify a position by setting the rate to be zero
  error ZeroRate();

  /// @notice Thrown when a user tries to create a position with zero swaps
  error ZeroSwaps();

  /// @notice Thrown when a user tries to add zero funds to their position
  error ZeroAmount();

  /// @notice Thrown when a user tries to modify the rate of a position that has already been completed
  error PositionCompleted();

  /// @notice Thrown when a user tries to modify a position that has too much swapped balance. This error
  /// is thrown so that the user doesn't lose any funds. The error indicates that the user must perform a withdraw
  /// before modifying their position
  error MandatoryWithdraw();

  /// @notice Returns a DCA position
  /// @param _dcaId The id of the position
  /// @return _position The position itself
  function userPosition(uint256 _dcaId) external view returns (UserPosition memory _position);

  /// @notice Creates a new position
  /// @dev Will revert:
  /// With ZeroAddress if _owner is zero
  /// With InvalidToken if _tokenAddress is neither token A nor token B
  /// With ZeroRate if _rate is zero
  /// With ZeroSwaps if _amountOfSwaps is zero
  /// With InvalidInterval if _swapInterval is not a valid swap interval
  /// @param _owner The address of the owner of the created position (nft)
  /// @param _tokenAddress The address of the token that will be deposited
  /// @param _rate How many "from" tokens need to be traded in each swap
  /// @param _amountOfSwaps How many swaps to execute for this position
  /// @param _swapInterval How frequently the position's swaps should be executed
  /// @return _dcaId The id of the created position
  function deposit(
    address _owner,
    address _tokenAddress,
    uint160 _rate,
    uint32 _amountOfSwaps,
    uint32 _swapInterval
  ) external returns (uint256 _dcaId);

  /// @notice Withdraws all swapped tokens from a position to a recipient
  /// @dev Will revert:
  /// With ZeroAddress if recipient is zero
  /// With InvalidPosition if _dcaId is invalid
  /// With UnauthorizedCaller if the caller doesn't have access to the position
  /// @param _dcaId The position's id
  /// @param _recipient The address to withdraw swapped tokens to
  /// @return _swapped How much was withdrawn
  function withdrawSwapped(uint256 _dcaId, address _recipient) external returns (uint256 _swapped);

  /// @notice Withdraws all swapped tokens from many positions
  /// @dev Will revert:
  /// With ZeroAddress if recipient is zero
  /// With InvalidPosition if any of the ids in _dcaIds is invalid
  /// With UnauthorizedCaller if the caller doesn't have access to any of the positions in _dcaIds
  /// @param _dcaIds The positions' ids
  /// @param _recipient The address to withdraw swapped tokens to
  /// @return _swappedTokenA How much was withdrawn in token A
  /// @return _swappedTokenB How much was withdrawn in token B
  function withdrawSwappedMany(uint256[] calldata _dcaIds, address _recipient) external returns (uint256 _swappedTokenA, uint256 _swappedTokenB);

  /// @notice Takes the unswapped balance, adds the new deposited funds and modifies the position so that
  /// it is executed in _newSwaps swaps
  /// @dev Will revert:
  /// With InvalidPosition if _dcaId is invalid
  /// With UnauthorizedCaller if the caller doesn't have access to the position
  /// With ZeroAmount if _amount is zero
  /// With ZeroSwaps if _newSwaps is zero
  /// With MandatoryWithdraw if the user must execute a withdraw before modifying their position
  /// @param _dcaId The position's id
  /// @param _amount Amounts of funds to add to the position
  /// @param _newSwaps The new amount of swaps
  function increasePosition(
    uint256 _dcaId,
    uint256 _amount,
    uint32 _newSwaps
  ) external;

  /// @notice Terminates the position and sends all unswapped and swapped balance to the caller
  /// @dev Will revert:
  /// With ZeroAddress if _recipientUnswapped or _recipientSwapped is zero
  /// With InvalidPosition if _dcaId is invalid
  /// With UnauthorizedCaller if the caller doesn't have access to the position
  /// @param _dcaId The position's id
  /// @param _recipientUnswapped The address to withdraw unswapped tokens to
  /// @param _recipientSwapped The address to withdraw swapped tokens to
  function terminate(
    uint256 _dcaId,
    address _recipientUnswapped,
    address _recipientSwapped
  ) external;
}

/// @title The interface for all swap related matters in a DCA pair
/// @notice These methods allow users to get information about the next swap, and how to execute it
interface IDCAHubSwapHandler {
  struct TokenInSwap {
    address token;
    uint256 reward;
    uint256 toProvide;
    uint256 platformFee;
  }

  /// @notice Thrown when trying to execute a swap, but none is available
  error NoSwapsToExecute();
}

/// @title The interface for all loan related matters in a DCA pair
/// @notice These methods allow users to ask how much is available for loans, and also to execute them
interface IDCAHubLoanHandler {
  struct Loan {
    address token;
    uint256 amount;
  }
}

interface IDCAHub is IDCAHubParameters, IDCAHubSwapHandler, IDCAHubPositionHandler, IDCAHubLoanHandler {}
