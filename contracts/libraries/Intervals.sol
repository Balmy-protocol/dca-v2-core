// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

/// @title Intervals library
/// @notice Provides functions to easily convert from swap intervals to their byte representation and viceversa
library Intervals {
  /// @notice Thrown when a user tries convert and invalid interval to a byte representation
  error InvalidInterval();

  /// @notice Thrown when a user tries convert and invalid byte representation to an interval
  error InvalidMask();

  /// @notice Takes a swap interval and returns its byte representation
  /// @dev Will revert with InvalidInterval if the swap interval is not valid
  /// @param _swapInterval The swap interval
  /// @return The interval's byte representation
  function intervalToMask(uint32 _swapInterval) internal pure returns (bytes1) {
    if (_swapInterval == 1 minutes) return 0x01;
    if (_swapInterval == 5 minutes) return 0x02;
    if (_swapInterval == 15 minutes) return 0x04;
    if (_swapInterval == 30 minutes) return 0x08;
    if (_swapInterval == 1 hours) return 0x10;
    if (_swapInterval == 4 hours) return 0x20;
    if (_swapInterval == 1 days) return 0x40;
    if (_swapInterval == 1 weeks) return 0x80;
    revert InvalidInterval();
  }

  /// @notice Takes a a byte representation of a swap interval and returns the swap interval
  /// @dev Will revert with InvalidMask if the byte representation is not valid
  /// @param _mask The byte representation
  /// @return The swap interval
  function maskToInterval(bytes1 _mask) internal pure returns (uint32) {
    if (_mask == 0x01) return 1 minutes;
    if (_mask == 0x02) return 5 minutes;
    if (_mask == 0x04) return 15 minutes;
    if (_mask == 0x08) return 30 minutes;
    if (_mask == 0x10) return 1 hours;
    if (_mask == 0x20) return 4 hours;
    if (_mask == 0x40) return 1 days;
    if (_mask == 0x80) return 1 weeks;
    revert InvalidMask();
  }

  // TODO: Add way to convert from combined byte to array
}
