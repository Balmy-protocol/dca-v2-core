// SPDX-License-Identifier: MIT

pragma solidity 0.7.0;

import "../../DDCA/DDCAPositionHandler.sol";
import "./DDCASwapHandler.sol";

contract DDCAPositionHandlerMock is DDCAPositionHandler, DDCASwapHandlerMock {
    constructor(
        address _feeRecipient,
        IERC20 _from,
        IERC20 _to,
        IUniswapV2Router02 _uniswap,
        uint256 _swapInterval
    ) DDCASwapHandlerMock(_feeRecipient, _from, _to, _uniswap, _swapInterval) {
        /* */
    }

    // PositionHandler
    function deposit(uint256 _rate, uint256 _amountOfSwaps) public override {
        _deposit(_rate, _amountOfSwaps);
    }

    function withdrawSwapped() external override returns (uint256 _swapped) {
        _withdrawSwapped();
    }

    function modifyRate(uint256 _newRate) external override {
        _modifyRate(_newRate);
    }

    function modifyRateAndSwaps(uint256 _newRate, uint256 _newSwaps) external override {
        _modifyRateAndSwaps(_newRate, _newSwaps);
    }

    function terminate() external override {
        _terminate();
    }
}
