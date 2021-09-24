// SPDX-License-Identifier: BUSL-1.1
pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/security/ReentrancyGuard.sol';
import './DCAHubConfigHandler.sol';

abstract contract DCAHubPlatformHandler is ReentrancyGuard, DCAHubConfigHandler {
  using SafeERC20 for IERC20Metadata;

  event WithdrewFromPlatform(address indexed sender, address indexed recipient, IDCAHub.AmountOfToken[] amounts);

  function withdrawFromPlatformBalance(IDCAHub.AmountOfToken[] calldata _amounts, address _recipient)
    external
    nonReentrant
    onlyRole(PLATFORM_WITHDRAW_ROLE)
  {
    for (uint256 i; i < _amounts.length; i++) {
      platformBalance[_amounts[i].token] -= _amounts[i].amount;
      IERC20Metadata(_amounts[i].token).safeTransfer(_recipient, _amounts[i].amount);
    }

    emit WithdrewFromPlatform(msg.sender, _recipient, _amounts);
  }
}
