// SPDX-License-Identifier: BUSL-1.1
pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/security/ReentrancyGuard.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '../interfaces/IDCAHubLoanCallee.sol';
import '../libraries/FeeMath.sol';
import './DCAHubConfigHandler.sol';

abstract contract DCAHubLoanHandler is ReentrancyGuard, DCAHubConfigHandler, IDCAHubLoanHandler {
  using SafeERC20 for IERC20Metadata;

  /// @inheritdoc IDCAHubLoanHandler
  function loan(
    IDCAHub.AmountOfToken[] calldata _loan,
    address _to,
    bytes calldata _data
  ) external nonReentrant whenNotPaused {
    // Note: we are caching this variable in memory so we can read storage only once (it's cheaper that way)
    uint32 _loanFee = loanFee;

    // Remember balances before callback
    uint256[] memory _beforeBalances = new uint256[](_loan.length);
    for (uint256 i; i < _beforeBalances.length; i++) {
      _beforeBalances[i] = IERC20Metadata(_loan[i].token).balanceOf(address(this));
    }

    // Transfer tokens
    for (uint256 i; i < _loan.length; i++) {
      // We are now making sure that tokens are sorted, as an easy way to detect duplicates
      if (i > 0 && _loan[i].token <= _loan[i - 1].token) revert IDCAHub.InvalidTokens();

      IERC20Metadata(_loan[i].token).safeTransfer(_to, _loan[i].amount);
    }

    // Make call
    IDCAHubLoanCallee(_to).DCAHubLoanCall(msg.sender, _loan, _loanFee, _data);

    for (uint256 i; i < _loan.length; i++) {
      uint256 _afterBalance = IERC20Metadata(_loan[i].token).balanceOf(address(this));

      // Make sure that they sent the tokens back
      if (_afterBalance < _beforeBalances[i] + FeeMath.calculateFeeForAmount(_loanFee, _loan[i].amount)) {
        revert IDCAHub.LiquidityNotReturned();
      }

      // Update platform balance
      platformBalance[_loan[i].token] += _afterBalance - _beforeBalances[i];
    }

    // Emit event
    emit Loaned(msg.sender, _to, _loan, _loanFee);
  }
}
