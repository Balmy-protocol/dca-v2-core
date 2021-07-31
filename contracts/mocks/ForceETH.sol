// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.6;

contract ForceETH {
  constructor(address payable _to) payable {
    selfdestruct(_to);
  }
}
