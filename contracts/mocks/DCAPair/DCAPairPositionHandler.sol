// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import '../../DCAPair/DCAPairPositionHandler.sol';
import './DCAPairSwapHandler.sol';

contract DCAPairPositionHandlerMock is DCAPairPositionHandler, DCAPairParametersMock {
  constructor(
    IDCAFactory _factory,
    IERC20Detailed _tokenA,
    IERC20Detailed _tokenB
  ) DCAPairParametersMock(_factory, _tokenA, _tokenB) DCAPairPositionHandler(_tokenA, _tokenB) {
    /* */
  }

  // PositionHandler
  function calculateSwapped(uint256 _dcaId) external view returns (uint256 _swapped) {
    _swapped = _calculateSwapped(_dcaId);
  }
}
