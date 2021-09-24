// SPDX-License-Identifier: BUSL-1.1
pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/security/ReentrancyGuard.sol';

import '../interfaces/IDCAHubLoanCallee.sol';
import '../libraries/CommonErrors.sol';

import './DCAHubConfigHandler.sol';

abstract contract DCAHubLoanHandler is ReentrancyGuard, DCAHubConfigHandler, IDCAHubLoanHandler {
  using SafeERC20 for IERC20Metadata;

  function availableToBorrow(address[] calldata _tokens) external view returns (uint256[] memory _available) {
    _available = new uint256[](_tokens.length);
    for (uint256 i; i < _tokens.length; i++) {
      _available[i] = _balances[_tokens[i]];
    }
  }

  event Loaned(address indexed sender, address indexed to, IDCAHub.AmountOfToken[] loan, uint32 fee);

  function loan(
    IDCAHub.AmountOfToken[] calldata _loan,
    address _to,
    bytes calldata _data
  ) external nonReentrant whenNotPaused {
    // Note: we are caching this variable in memory so we can read storage only once (it's cheaper that way)
    uint32 _loanFee = loanFee;

    // Transfer tokens
    for (uint256 i; i < _loan.length; i++) {
      // TODO: Fail if tokens are not sorted (that way, we can detect duplicates)

      IERC20Metadata(_loan[i].token).safeTransfer(_to, _loan[i].amount);
    }

    // Make call
    IDCAHubLoanCallee(_to).DCAHubLoanCall(msg.sender, _loan, _loanFee, _data);

    for (uint256 i; i < _loan.length; i++) {
      uint256 _beforeBalance = _balances[_loan[i].token];
      uint256 _afterBalance = IERC20Metadata(_loan[i].token).balanceOf(address(this));

      // Make sure that they sent the tokens back
      if (_afterBalance < _beforeBalance + _getFeeFromAmount(_loanFee, _loan[i].amount)) {
        revert CommonErrors.LiquidityNotReturned();
      }

      // Update balance
      _balances[_loan[i].token] = _afterBalance;

      // Update platform balance
      platformBalance[_loan[i].token] += _afterBalance - _beforeBalance;
    }

    // Emit event
    emit Loaned(msg.sender, _to, _loan, _loanFee);
  }
}
