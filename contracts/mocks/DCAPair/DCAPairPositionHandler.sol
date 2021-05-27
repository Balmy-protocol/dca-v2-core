// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import '../../DCAPair/DCAPairPositionHandler.sol';
import './DCAPairParameters.sol';

contract DCAPairPositionHandlerMock is DCAPairPositionHandler, DCAPairParametersMock {
  constructor(
    IDCAGlobalParameters _globalParameters,
    IERC20Detailed _tokenA,
    IERC20Detailed _tokenB
  ) DCAPairParametersMock(_globalParameters, _tokenA, _tokenB) DCAPairPositionHandler(_tokenA, _tokenB) {
    /* */
  }

  // PositionHandler
  function calculateSwapped(uint256 _dcaId) external view returns (uint256 _swapped) {
    _swapped = _calculateSwapped(_dcaId);
  }

  function modifyPosition(
    uint256 _dcaId,
    uint256 _totalNecessary,
    uint256 _unswapped,
    uint192 _newRate,
    uint32 _newAmountOfSwaps
  ) external {
    _modifyPosition(_dcaId, _totalNecessary, _unswapped, _newRate, _newAmountOfSwaps);
  }
}
