// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.4;

import '../../../DCASubsidyPool/MultiAsymmetricPool/MAPPositionHandler.sol';
import './MAPParameters.sol';

contract MAPPositionHandlerMock is MAPPositionHandler, MAPParametersMock {
  function deposit(
    address _pair,
    uint256 _amountTokenA,
    uint256 _amountTokenB
  ) public override returns (uint256 _positionId) {
    _positionId = _deposit(_pair, _amountTokenA, _amountTokenB);
  }

  function calculateOwned(uint256 _positionId) public view override returns (uint256 _amountTokenA, uint256 _amountTokenB) {
    (_amountTokenA, _amountTokenB) = _calculateOwned(_positionId);
  }

  function setRatio(uint256 _ratio) public {
    _oracleRatioFromAToB = _ratio;
  }

  function setTotalShares(address _pair, uint256 _totalShares) public {
    totalShares[_pair] = _totalShares;
  }
}
