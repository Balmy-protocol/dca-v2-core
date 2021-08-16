// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.6;

import './ITimeWeightedOracle.sol';
import './IDCATokenDescriptor.sol';

/// @title The interface for handling parameters the affect the whole DCA ecosystem
/// @notice This contract will manage configuration that affects all pairs, swappers, etc
interface IDCAGlobalParameters {
  /// @notice A compilation of all parameters that affect a swap
  struct SwapParameters {
    // The address of the fee recipient
    address feeRecipient;
    // Whether swaps are paused or not
    bool isPaused;
    // The swap fee
    uint32 swapFee;
    // The oracle contract
    ITimeWeightedOracle oracle;
  }

  /// @notice A compilation of all parameters that affect a loan
  struct LoanParameters {
    // The address of the fee recipient
    address feeRecipient;
    // Whether loans are paused or not
    bool isPaused;
    // The loan fee
    uint32 loanFee;
  }

  /// @notice Emitted when a new fee recipient is set
  /// @param _feeRecipient The address of the new fee recipient
  event FeeRecipientSet(address _feeRecipient);

  /// @notice Emitted when a new NFT descriptor is set
  /// @param _descriptor The new NFT descriptor contract
  event NFTDescriptorSet(IDCATokenDescriptor _descriptor);

  /// @notice Emitted when a new oracle is set
  /// @param _oracle The new oracle contract
  event OracleSet(ITimeWeightedOracle _oracle);

  /// @notice Emitted when a new swap fee is set
  /// @param _feeSet The new swap fee
  event SwapFeeSet(uint32 _feeSet);

  /// @notice Emitted when a new loan fee is set
  /// @param _feeSet The new loan fee
  event LoanFeeSet(uint32 _feeSet);

  /// @notice Emitted when new swap intervals are allowed
  /// @param _swapIntervals The new swap intervals
  /// @param _descriptions The descriptions for each swap interval
  event SwapIntervalsAllowed(uint32[] _swapIntervals, string[] _descriptions);

  /// @notice Emitted when some swap intervals are no longer allowed
  /// @param _swapIntervals The swap intervals that are no longer allowed
  event SwapIntervalsForbidden(uint32[] _swapIntervals);

  /// @notice Thrown when trying to set a fee higher than the maximum allowed
  error HighFee();

  /// @notice Thrown when trying to support new swap intervals, but the amount of descriptions doesn't match
  error InvalidParams();

  /// @notice Thrown when trying to support a new swap interval of value zero
  error ZeroInterval();

  /// @notice Thrown when trying a description for a new swap interval is empty
  error EmptyDescription();

  /// @notice Returns the address of the fee recipient
  /// @return _feeRecipient The address of the fee recipient
  function feeRecipient() external view returns (address _feeRecipient);

  /// @notice Returns fee charged on swaps
  /// @return _swapFee The fee itself
  function swapFee() external view returns (uint32 _swapFee);

  /// @notice Returns fee charged on loans
  /// @return _loanFee The fee itself
  function loanFee() external view returns (uint32 _loanFee);

  /// @notice Returns the NFT descriptor contract
  /// @return _nftDescriptor The contract itself
  function nftDescriptor() external view returns (IDCATokenDescriptor _nftDescriptor);

  /// @notice Returns the time-weighted oracle contract
  /// @return _oracle The contract itself
  function oracle() external view returns (ITimeWeightedOracle _oracle);

  /// @notice Returns the precision used for fees
  /// @dev Cannot be modified
  /// @return _precision The precision used for fees
  // solhint-disable-next-line func-name-mixedcase
  function FEE_PRECISION() external view returns (uint24 _precision);

  /// @notice Returns the max fee that can be set for either swap or loans
  /// @dev Cannot be modified
  /// @return _maxFee The maximum possible fee
  // solhint-disable-next-line func-name-mixedcase
  function MAX_FEE() external view returns (uint32 _maxFee);

  /// @notice Returns a list of all the allowed swap intervals
  /// @return _allowedSwapIntervals An array with all allowed swap intervals
  function allowedSwapIntervals() external view returns (uint32[] memory _allowedSwapIntervals);

  /// @notice Returns the description for a given swap interval
  /// @return _description The swap interval's description
  function intervalDescription(uint32 _swapInterval) external view returns (string memory _description);

  /// @notice Returns whether a swap interval is currently allowed
  /// @return _isAllowed Whether the given swap interval is currently allowed
  function isSwapIntervalAllowed(uint32 _swapInterval) external view returns (bool _isAllowed);

  /// @notice Returns whether swaps and loans are currently paused
  /// @return _isPaused Whether swaps and loans are currently paused
  function paused() external view returns (bool _isPaused);

  /// @notice Returns a compilation of all parameters that affect a swap
  /// @return _swapParameters All parameters that affect a swap
  function swapParameters() external view returns (SwapParameters memory _swapParameters);

  /// @notice Returns a compilation of all parameters that affect a loan
  /// @return _loanParameters All parameters that affect a loan
  function loanParameters() external view returns (LoanParameters memory _loanParameters);

  /// @notice Sets a new fee recipient address
  /// @dev Will revert with ZeroAddress if the zero address is passed
  /// @param _feeRecipient The new fee recipient address
  function setFeeRecipient(address _feeRecipient) external;

  /// @notice Sets a new swap fee
  /// @dev Will rever with HighFee if the fee is higher than the maximum
  /// @param _fee The new swap fee
  function setSwapFee(uint32 _fee) external;

  /// @notice Sets a new loan fee
  /// @dev Will rever with HighFee if the fee is higher than the maximum
  /// @param _fee The new loan fee
  function setLoanFee(uint32 _fee) external;

  /// @notice Sets a new NFT descriptor
  /// @dev Will revert with ZeroAddress if the zero address is passed
  /// @param _descriptor The new descriptor contract
  function setNFTDescriptor(IDCATokenDescriptor _descriptor) external;

  /// @notice Sets a new time-weighted oracle
  /// @dev Will revert with ZeroAddress if the zero address is passed
  /// @param _oracle The new oracle contract
  function setOracle(ITimeWeightedOracle _oracle) external;

  /// @notice Adds new swap intervals to the allowed list
  /// @dev Will revert with:
  /// InvalidParams if the amount of swap intervals is different from the amount of descriptions passed
  /// ZeroInterval if any of the swap intervals is zero
  /// EmptyDescription if any of the descriptions is empty
  /// @param _swapIntervals The new swap intervals
  /// @param _descriptions Their descriptions
  function addSwapIntervalsToAllowedList(uint32[] calldata _swapIntervals, string[] calldata _descriptions) external;

  /// @notice Removes some swap intervals from the allowed list
  /// @param _swapIntervals The swap intervals to remove
  function removeSwapIntervalsFromAllowedList(uint32[] calldata _swapIntervals) external;

  /// @notice Pauses all swaps and loans
  function pause() external;

  /// @notice Unpauses all swaps and loans
  function unpause() external;
}
