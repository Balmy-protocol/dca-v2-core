// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.6;

import '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';
import './IDCAHub.sol';

/// @title The interface for handling flash loans
/// @notice Users that want to execute flash loans must implement this interface
interface IDCAHubLoanCallee {
  // solhint-disable-next-line func-name-mixedcase
  function DCAHubLoanCall(
    address _sender,
    IDCAHub.Loan[] calldata _loan,
    uint32 _loanFee,
    bytes calldata _data
  ) external;
}
