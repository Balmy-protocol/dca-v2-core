// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.6;

import '../../DCAHub/DCAHubPositionHandler.sol';
import './DCAHubParameters.sol';

contract DCAHubPositionHandlerMock is DCAHubPositionHandler, DCAHubParametersMock {
  constructor(
    IDCAGlobalParameters _globalParameters,
    IERC20Metadata _tokenA,
    IERC20Metadata _tokenB
  ) DCAHubParametersMock(_globalParameters, _tokenA, _tokenB) DCAHubPositionHandler(_tokenA, _tokenB) {
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

  function internalWithdrawSwapped(uint256 _dcaId, address _recipient) external returns (uint256 _amount) {
    _amount = _withdrawSwapped(_dcaId, _recipient);
  }
}
