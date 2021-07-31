// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.6;

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
  function internalPosition(uint256 _dcaId) external view returns (DCA memory _dca) {
    _dca = _userPositions[_dcaId];
  }

  function modifyPosition(
    uint256 _dcaId,
    uint256 _totalNecessary,
    uint256 _unswapped,
    uint160 _newRate,
    uint32 _newAmountOfSwaps
  ) external {
    _modifyPosition(_dcaId, _totalNecessary, _unswapped, _newRate, _newAmountOfSwaps);
  }
}
