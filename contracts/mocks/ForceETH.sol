// SPDX-License-Identifier: UNLICENSED

pragma solidity >=0.8.7 <0.9.0;

contract ForceETH {
  constructor(address payable _to) payable {
    selfdestruct(_to);
  }
}
