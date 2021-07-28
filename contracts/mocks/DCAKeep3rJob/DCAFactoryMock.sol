// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

contract DCAFactoryMock {
  mapping(address => bool) private _pairs;

  function isPair(address _address) external view returns (bool _isPair) {
    _isPair = _pairs[_address];
  }

  function setAsPair(address _address) external {
    _pairs[_address] = true;
  }
}
