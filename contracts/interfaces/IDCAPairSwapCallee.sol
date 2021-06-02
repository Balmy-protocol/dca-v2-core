// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

import './IERC20Detailed.sol';

interface IDCAPairSwapCallee {
  // solhint-disable-next-line func-name-mixedcase
  function DCAPairSwapCall(
    address _sender,
    IERC20Detailed _tokenA,
    IERC20Detailed _tokenB,
    uint256 _amountBorrowedTokenA,
    uint256 _amountBorrowedTokenB,
    bool _isRewardTokenA,
    uint256 _rewardAmount,
    uint256 _amountToProvide,
    bytes calldata _data
  ) external;
}
