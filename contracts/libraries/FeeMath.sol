// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

/// @title Fee Math library
/// @notice Provides functions to calculate and apply fees to amounts
library FeeMath {
  /// @notice How much would a 1% fee be
  uint24 public constant FEE_PRECISION = 10000;

  /// @notice Takes a fee and an amount that has had the fee substracted, and returns the amount that was substracted
  /// @param _fee Fee that was applied
  /// @param _substractionResult Amount that had the fee substracted
  /// @return The amount that was substracted
  function calculateSubstractedFee(uint32 _fee, uint256 _substractionResult) internal pure returns (uint256) {
    return (_substractionResult * _fee) / (FEE_PRECISION * 100 - _fee);
  }

  /// @notice Takes a fee and applies it to a certain amount. So if fee is 0.6%, it would return the 0.6% of the given amount
  /// @param _fee Fee to apply
  /// @param _amount Amount to apply the fee to
  /// @return The calculated fee
  function calculateFeeForAmount(uint32 _fee, uint256 _amount) internal pure returns (uint256) {
    return (_amount * _fee) / FEE_PRECISION / 100;
  }

  /// @notice Takes a fee and a certain amount, and substracts the fee. So if fee is 0.6%, it would return 99.4% of the given amount
  /// @param _fee Fee to substract
  /// @param _amount Amount that substract the fee from
  /// @return The amount with the fee substracted
  function substractFeeFromAmount(uint32 _fee, uint256 _amount) internal pure returns (uint256) {
    return (_amount * (FEE_PRECISION - _fee / 100)) / FEE_PRECISION;
  }
}
