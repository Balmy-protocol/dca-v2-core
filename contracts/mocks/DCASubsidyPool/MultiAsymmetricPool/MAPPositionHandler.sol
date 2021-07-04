// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.4;

import '../../../DCASubsidyPool/MultiAsymmetricPool/MAPPositionHandler.sol';
import './MAPParameters.sol';

contract MAPPositionHandlerMock is MAPPositionHandler, MAPParametersMock {
  mapping(address => PairData) private _overridePairData;
  uint256 private _oracleRatioFromAToB;

  function setPairData(
    address _pair,
    address _tokenA,
    address _tokenB
  ) public {
    _overridePairData[_pair] = PairData(_tokenA, _tokenB);
  }

  function setRatio(uint256 _ratio) public {
    _oracleRatioFromAToB = _ratio;
  }

  function setTotalShares(address _pair, uint256 _amountOfShares) public {
    _totalShares[_pair] = _amountOfShares;
  }

  function totalShares(address _pair) public view returns (uint256) {
    return _totalShares[_pair];
  }

  function position(address _pair, address _owner) public view returns (PairPosition memory _pairPosition) {
    _pairPosition = _positions[_pair][_owner];
  }

  // solhint-disable-next-line func-name-mixedcase
  function POSITION_RATIO_PRECISION() public pure returns (uint104) {
    return _POSITION_RATIO_PRECISION;
  }

  function _fetchRatio() internal view override returns (uint256 _ratio) {
    if (_oracleRatioFromAToB > 0) {
      _ratio = _oracleRatioFromAToB;
    } else {
      _ratio = super._fetchRatio();
    }
  }

  function _getPairData(address _pair) internal view override returns (PairData memory _pairData) {
    if (_overridePairData[_pair].tokenA != address(0)) {
      _pairData = _overridePairData[_pair];
    } else {
      _pairData = super._getPairData(_pair);
    }
  }
}
