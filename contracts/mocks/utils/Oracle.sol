// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import '../../utils/Oracle.sol';

contract OracleMock is Oracle {
  constructor() {}

  function getBestPoolForPair(address _tokenA, address _tokenB) external view returns (address _bestPool) {
    return _getBestPoolForPair(_tokenA, _tokenB);
  }
}
