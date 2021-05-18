// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

import './IERC20Detailed.sol';

interface IDCAPairSwapCallee {
  // solhint-disable-next-line func-name-mixedcase
  function DCAPairSwapCall(
    address _sender,
    IERC20Detailed _rewardToken,
    uint256 _rewardAmount,
    IERC20Detailed _tokenToProvide,
    uint256 _amountToProvide,
    bytes calldata _data
  ) external;
}
