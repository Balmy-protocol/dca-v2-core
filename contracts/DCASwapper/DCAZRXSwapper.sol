// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.6;

import 'hardhat/console.sol';

import '@openzeppelin/contracts/security/Pausable.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

import '../utils/Governable.sol';
import '../utils/CollectableDust.sol';
import '../interfaces/IDCASwapper.sol';
import '../interfaces/IDCAPairSwapCallee.sol';
import '../libraries/CommonErrors.sol';

contract DCAZRXSwapper is IDCASwapper, Governable, IDCAPairSwapCallee, CollectableDust, Pausable {
  using SafeERC20 for IERC20;

  // solhint-disable-next-line var-name-mixedcase
  address public ZRX;

  constructor(address _governor, address _ZRX) Governable(_governor) {
    if (address(_ZRX) == address(0)) revert CommonErrors.ZeroAddress();
    ZRX = _ZRX;
  }

  function swapPairs(PairToSwap[] calldata _pairsToSwap) external override whenNotPaused returns (uint256 _amountSwapped) {
    if (_pairsToSwap.length == 0) revert ZeroPairsToSwap();

    uint256 _maxGasSpent;

    do {
      uint256 _gasLeftStart = gasleft();
      _swap(_pairsToSwap[_amountSwapped++]);
      uint256 _gasSpent = _gasLeftStart - gasleft();

      // Update max gas spent if necessary
      if (_gasSpent > _maxGasSpent) {
        _maxGasSpent = _gasSpent;
      }

      // We will continue to execute swaps if there are more swaps to execute, and (gas left) >= 1.5 * (max gas spent on a swap)
    } while (_amountSwapped < _pairsToSwap.length && gasleft() >= (_maxGasSpent * 3) / 2);

    emit Swapped(_pairsToSwap, _amountSwapped);
  }

  function paused() public view override(IDCASwapper, Pausable) returns (bool) {
    return super.paused();
  }

  function pause() external override onlyGovernor {
    _pause();
  }

  function unpause() external override onlyGovernor {
    _unpause();
  }

  /**
   * This method will not actually provide the correct bytes to resolve the pair's swap. It's here to comply with interface and
   * do some basic evals on pairs to be swapped.
   * Therefore, we highly suggest not to call this method on-chain or use the return to execute the swaps.
   * This method will return a non-empty set of bytes if the pair should be checked off-chain to swap,
   * and encode(max(uint24)) if there is no need to go to 0x and it can be swapped
   */
  function findBestSwap(IDCAPair _pair) external view override returns (bytes memory _swapPath) {
    IDCAPairSwapHandler.NextSwapInformation memory _nextSwapInformation = _pair.getNextSwapInfo();
    if (_nextSwapInformation.amountOfSwaps > 0) {
      if (_nextSwapInformation.amountToBeProvidedBySwapper == 0) {
        return abi.encode(type(uint24).max);
      } else {
        return abi.encode(1);
      }
    }
  }

  function _swap(PairToSwap memory _pair) internal {
    // Execute the swap, making myself the callee so that the `DCAPairSwapCall` function is called
    _pair.pair.swap(0, 0, address(this), _pair.swapPath);
  }

  function sendDust(
    address _to,
    address _token,
    uint256 _amount
  ) external override onlyGovernor {
    _sendDust(_to, _token, _amount);
  }

  // solhint-disable-next-line func-name-mixedcase
  function DCAPairSwapCall(
    address,
    IERC20Metadata _tokenA,
    IERC20Metadata _tokenB,
    uint256,
    uint256,
    bool _isRewardTokenA,
    uint256 _rewardAmount,
    uint256 _amountToProvide,
    bytes calldata _bytes
  ) external override {
    if (_amountToProvide > 0) {
      address _tokenIn = _isRewardTokenA ? address(_tokenA) : address(_tokenB);
      address _tokenOut = _isRewardTokenA ? address(_tokenB) : address(_tokenA);
      IERC20(_tokenIn).safeApprove(ZRX, _rewardAmount);
      (bool success, ) = ZRX.call{value: 0}(_bytes);
      require(success, 'Swapper: ZRX trade reverted');
      IERC20(_tokenOut).safeTransfer(msg.sender, IERC20(_tokenOut).balanceOf(address(this)));
    }
  }
}
