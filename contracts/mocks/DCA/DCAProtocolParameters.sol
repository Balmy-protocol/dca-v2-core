// SPDX-License-Identifier: MIT

pragma solidity 0.7.0;

import "../../DCA/DCAProtocolParameters.sol";

contract DCAProtocolParametersMock is DCAProtocolParameters {
  constructor(
    address _feeRecipient,
    IERC20Decimals _from,
    IERC20Decimals _to,
    IUniswapV2Router02 _uniswap
  ) DCAProtocolParameters(_feeRecipient, _from, _to, _uniswap) {
    /* */
  }

  function setFeeRecipient(address _feeRecipient) public override {
    _setFeeRecipient(_feeRecipient);
  }

  function setFrom(IERC20Decimals _from) public override {
    _setFrom(_from);
  }

  function setTo(IERC20Decimals _from) public override {
    _setTo(_from);
  }

  function magnitude() public view returns (uint256) {
    return _magnitude;
  }

  function setUniswap(IUniswapV2Router02 _uniswap) public override {
    _setUniswap(_uniswap);
  }

  // Mocks setters
  function setSwapAmountDelta(uint256 _swap, int256 _delta) public {
    swapAmountDelta[_swap] = _delta;
  }

  function setAverageRatesPerUnit(uint256 _swap, uint256[2] memory _averageRatePerUnit) public {
    accumRatesPerUnit[_swap] = _averageRatePerUnit;
  }
}
