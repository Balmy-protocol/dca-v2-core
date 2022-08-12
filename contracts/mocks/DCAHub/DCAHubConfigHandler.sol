// SPDX-License-Identifier: UNLICENSED

pragma solidity >=0.8.7 <0.9.0;

import '../../DCAHub/DCAHubConfigHandler.sol';
import './DCAHubParameters.sol';

contract DCAHubConfigHandlerMock is DCAHubConfigHandler, DCAHubParametersMock {
  constructor(
    address _immediateGovernor,
    address _timeLockedGovernor,
    ITokenPriceOracle _oracle
  ) DCAHubConfigHandler(_immediateGovernor, _timeLockedGovernor, _oracle) {}

  function setAllowedToken(address _token, bool _allowed) external {
    allowedTokens[_token] = _allowed;
  }

  function setActiveSwapIntervals(
    address _tokenA,
    address _tokenB,
    bytes1 _activeSwapIntervals
  ) external {
    activeSwapIntervals[_tokenA][_tokenB] = _activeSwapIntervals;
  }
}
