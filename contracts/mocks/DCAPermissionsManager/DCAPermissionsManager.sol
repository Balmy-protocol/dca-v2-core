// SPDX-License-Identifier: UNLICENSED

pragma solidity >=0.8.7 <0.9.0;

import '../../DCAPermissionsManager/DCAPermissionsManager.sol';

contract DCAPermissionsManagerMock is DCAPermissionsManager {
  uint256 private _blockNumber;

  constructor(address _governor, IDCATokenDescriptor _descriptor) DCAPermissionsManager(_governor, _descriptor) {}

  function setBlockNumber(uint256 __blockNumber) external {
    _blockNumber = __blockNumber;
  }

  function burnCounter() external view returns (uint256) {
    return _burnCounter;
  }

  function _getBlockNumber() internal view override returns (uint256) {
    if (_blockNumber > 0) {
      return _blockNumber;
    } else {
      return super._getBlockNumber();
    }
  }
}
