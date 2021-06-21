// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

import '../libraries/NFTDescriptor.sol';

contract NFTDescriptorMock {
  function fixedPointToDecimalString(uint256 value, uint8 decimals) public pure returns (string memory) {
    return NFTDescriptor.fixedPointToDecimalString(value, decimals);
  }

  function addressToString(address _addr) public pure returns (string memory) {
    return NFTDescriptor.addressToString(_addr);
  }
}
