// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.6;

import '@uniswap/v3-periphery/contracts/interfaces/IQuoterV2.sol';
import '../../interfaces/IERC20Detailed.sol';

contract QuoterMock {
  address public immutable factory;
  mapping(uint24 => uint256) private _amountNecessary;
  mapping(uint24 => bool) private _reverts;

  constructor(address _factory) {
    factory = _factory;
  }

  function setAmountNecessary(uint24 _feeTier, uint256 __amountNecessary) external {
    _amountNecessary[_feeTier] = __amountNecessary;
  }

  function revertOn(uint24 _feeTier) external {
    _reverts[_feeTier] = true;
  }

  function quoteExactOutputSingle(
    address,
    address,
    uint24 _feeTier,
    uint256,
    uint160
  ) external view returns (uint256) {
    require(!_reverts[_feeTier]);
    return _amountNecessary[_feeTier];
  }
}
