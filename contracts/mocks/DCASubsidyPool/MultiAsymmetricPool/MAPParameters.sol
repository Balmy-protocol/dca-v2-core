// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.4;

import '../../../DCASubsidyPool/MultiAsymmetricPool/MAPParameters.sol';

contract MAPParametersMock is MAPParameters {
  function addLiquidity(
    address _pair,
    uint256 _amountTokenA,
    uint256 _amountTokenB
  ) public {
    liquidity[_pair].amountTokenA += _amountTokenA;
    liquidity[_pair].amountTokenB += _amountTokenB;
  }

  function setLiquidity(
    address _pair,
    uint256 _amountTokenA,
    uint256 _amountTokenB
  ) public {
    liquidity[_pair].amountTokenA = _amountTokenA;
    liquidity[_pair].amountTokenB = _amountTokenB;
  }
}
