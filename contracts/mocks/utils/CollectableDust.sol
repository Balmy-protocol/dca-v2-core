// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import '../../utils/CollectableDust.sol';

contract CollectableDustMock is CollectableDust {
  using EnumerableSet for EnumerableSet.AddressSet;

  constructor() {}

  function addProtocolToken(address _token) external {
    _addProtocolToken(_token);
  }

  function removeProtocolToken(address _token) external {
    _removeProtocolToken(_token);
  }

  function containsProtocolToken(address _token) external view returns (bool) {
    return _protocolTokens.contains(_token);
  }

  function sendDust(
    address _to,
    address _token,
    uint256 _amount
  ) external override {
    _sendDust(_to, _token, _amount);
  }
}
