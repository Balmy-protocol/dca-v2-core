// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import 'hardhat/console.sol';
import '@openzeppelin/contracts/utils/Create2.sol';

contract Factory {
  event ContractDeployed(address _deploymentAddress);

  function deploy(bytes32 _salt, bytes memory _creationCode) public returns (address _deploymentAddress) {
    _deploymentAddress = Create2.deploy(0, _salt, _creationCode);
    emit ContractDeployed(_deploymentAddress);
  }

  function computeAddress(bytes32 _salt, bytes memory _creationCode) public view returns (address) {
    return Create2.computeAddress(_salt, keccak256(_creationCode));
  }
}
