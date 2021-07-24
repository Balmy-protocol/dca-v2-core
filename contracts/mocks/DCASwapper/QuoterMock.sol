// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

import '@uniswap/v3-periphery/contracts/interfaces/IQuoterV2.sol';
import '../../interfaces/IERC20Detailed.sol';

contract QuoterMock {
  address public immutable factory;
  mapping(uint24 => uint256) private _amountNecessary;

  constructor(address _factory) {
    factory = _factory;
  }

  function setAmountNecessary(uint24 _feeTier, uint256 __amountNecessary) external {
    _amountNecessary[_feeTier] = __amountNecessary;
  }

  function quoteExactOutputSingle(
    address,
    address,
    uint24 _feeTier,
    uint256,
    uint160
  ) external view returns (uint256) {
    return _amountNecessary[_feeTier];
  }
}
