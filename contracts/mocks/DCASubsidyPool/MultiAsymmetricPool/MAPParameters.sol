// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.4;

import '../../../DCASubsidyPool/MultiAsymmetricPool/MAPParameters.sol';

contract MAPParametersMock is MAPParameters {
  // Mocks setters
  function setPairData(
    address _pair,
    address _tokenA,
    address _tokenB
  ) public {
    _pairs[_pair] = PairData(_tokenA, _tokenB);
  }

  function addLiquidity(
    address _pair,
    uint256 _amountTokenA,
    uint256 _amountTokenB
  ) public {
    liquidity[_pair].tokenA += _amountTokenA;
    liquidity[_pair].tokenB += _amountTokenB;
  }

  function setLiquidity(
    address _pair,
    uint256 _amountTokenA,
    uint256 _amountTokenB
  ) public {
    liquidity[_pair].tokenA = _amountTokenA;
    liquidity[_pair].tokenB = _amountTokenB;
  }
}
