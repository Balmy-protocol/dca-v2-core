// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.6;

import '@openzeppelin/contracts/security/Pausable.sol';
import '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';
import '@uniswap/v3-periphery/contracts/interfaces/IQuoter.sol';
import '@uniswap/v3-periphery/contracts/interfaces/IPeripheryImmutableState.sol';
import '@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol';
import '@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol';
import '../utils/Governable.sol';
import '../utils/CollectableDust.sol';
import '../interfaces/IDCASwapper.sol';
import '../interfaces/IDCAPairSwapCallee.sol';
import '../libraries/CommonErrors.sol';

interface ICustomQuoter is IQuoter, IPeripheryImmutableState {}

contract DCAUniswapV3Swapper is IDCASwapper, Governable, IDCAPairSwapCallee, CollectableDust, Pausable {
  // solhint-disable-next-line var-name-mixedcase
  uint24[] private _FEE_TIERS = [500, 3000, 10000];
  ISwapRouter public immutable swapRouter;
  ICustomQuoter public immutable quoter;

  constructor(
    address _governor,
    ISwapRouter _swapRouter,
    ICustomQuoter _quoter
  ) Governable(_governor) {
    if (address(_swapRouter) == address(0) || address(_quoter) == address(0)) revert CommonErrors.ZeroAddress();
    swapRouter = _swapRouter;
    quoter = _quoter;
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
   * This method isn't a view because the Uniswap quoter doesn't support view quotes.
   * Therefore, we highly recommend that this method is not called on-chain.
   * This method will return an empty set of bytes if the pair should not be swapped, and encode(max(uint24)) if there is no need to go to Uniswap
   */
  function findBestSwap(IDCAPair _pair) external override returns (bytes memory _swapPath) {
    IDCAPairSwapHandler.NextSwapInformation memory _nextSwapInformation = _pair.getNextSwapInfo();
    if (_nextSwapInformation.amountOfSwaps > 0) {
      if (_nextSwapInformation.amountToBeProvidedBySwapper == 0) {
        return abi.encode(type(uint24).max);
      } else {
        uint256 _minNecessary;
        uint24 _feeTier;
        for (uint256 i; i < _FEE_TIERS.length; i++) {
          address _factory = quoter.factory();
          address _pool = IUniswapV3Factory(_factory).getPool(
            address(_nextSwapInformation.tokenToRewardSwapperWith),
            address(_nextSwapInformation.tokenToBeProvidedBySwapper),
            _FEE_TIERS[i]
          );
          if (_pool != address(0)) {
            try
              quoter.quoteExactOutputSingle(
                address(_nextSwapInformation.tokenToRewardSwapperWith),
                address(_nextSwapInformation.tokenToBeProvidedBySwapper),
                _FEE_TIERS[i],
                _nextSwapInformation.amountToBeProvidedBySwapper,
                0
              )
            returns (uint256 _inputNecessary) {
              if (_nextSwapInformation.amountToRewardSwapperWith >= _inputNecessary && (_minNecessary == 0 || _inputNecessary < _minNecessary)) {
                _minNecessary = _inputNecessary;
                _feeTier = _FEE_TIERS[i];
              }
            } catch {}
          }
        }
        if (_feeTier > 0) {
          _swapPath = abi.encode(_feeTier);
        }
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

      // Approve the router to spend the specifed `rewardAmount` of tokenIn.
      TransferHelper.safeApprove(_tokenIn, address(swapRouter), _rewardAmount);

      ISwapRouter.ExactOutputSingleParams memory params = ISwapRouter.ExactOutputSingleParams({
        tokenIn: _tokenIn,
        tokenOut: _tokenOut,
        fee: abi.decode(_bytes, (uint24)),
        recipient: msg.sender, // Send it directly to pair
        deadline: block.timestamp, // Needs to happen now
        amountOut: _amountToProvide,
        amountInMaximum: _rewardAmount,
        sqrtPriceLimitX96: 0
      });

      // Executes the swap returning the amountIn needed to spend to receive the desired amountOut.
      uint256 _amountIn = swapRouter.exactOutputSingle(params);

      // For exact output swaps, the amountInMaximum may not have all been spent.
      // If the actual amount spent (amountIn) is less than the specified maximum amount, we must refund the pair (msg.sender) and approve the swapRouter to spend 0.
      if (_amountIn < _rewardAmount) {
        TransferHelper.safeApprove(_tokenIn, address(swapRouter), 0);
        TransferHelper.safeTransfer(_tokenIn, msg.sender, _rewardAmount - _amountIn);
      }
    }
  }
}
