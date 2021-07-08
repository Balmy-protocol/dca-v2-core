// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.4;

import '@openzeppelin/contracts/utils/structs/EnumerableSet.sol';
import '@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol';
import '../utils/Governable.sol';
import '../interfaces/IDCASwapper.sol';
import '../interfaces/IDCAPairSwapCallee.sol';
import '../libraries/CommonErrors.sol';

contract DCASwapper is IDCASwapper, Governable, IDCAPairSwapCallee {
  using EnumerableSet for EnumerableSet.AddressSet;

  IDCAFactory public immutable override factory;
  ISwapRouter public immutable override swapRouter;
  IQuoterV2 public immutable override quoter;
  EnumerableSet.AddressSet internal _watchedPairs;

  constructor(
    address _governor,
    IDCAFactory _factory,
    ISwapRouter _swapRouter,
    IQuoterV2 _quoter
  ) Governable(_governor) {
    if (address(_factory) == address(0) || address(_swapRouter) == address(0) || address(_quoter) == address(0))
      revert CommonErrors.ZeroAddress();
    factory = _factory;
    swapRouter = _swapRouter;
    quoter = _quoter;
  }

  function startWatchingPairs(address[] calldata _pairs) public override onlyGovernor {
    for (uint256 i; i < _pairs.length; i++) {
      if (!factory.isPair(_pairs[i])) revert InvalidPairAddress();
      _watchedPairs.add(_pairs[i]);
    }
    emit WatchingNewPairs(_pairs);
  }

  function stopWatchingPairs(address[] calldata _pairs) public override onlyGovernor {
    for (uint256 i; i < _pairs.length; i++) {
      _watchedPairs.remove(_pairs[i]);
    }
    emit StoppedWatchingPairs(_pairs);
  }

  function watchedPairs() external view override returns (address[] memory _pairs) {
    uint256 _length = _watchedPairs.length();
    _pairs = new address[](_length);
    for (uint256 i; i < _length; i++) {
      _pairs[i] = _watchedPairs.at(i);
    }
  }

  /**
   * This method isn't a view and it is extremelly expensive and inefficient.
   * DO NOT call this method on-chain, it is for off-chain purposes only.
   */
  function getPairsToSwap() external override returns (IDCAPair[] memory _pairs) {
    uint256 _count;

    // Count how many pairs can be swapped
    uint256 _length = _watchedPairs.length();
    for (uint256 i; i < _length; i++) {
      if (_shouldSwapPair(IDCAPair(_watchedPairs.at(i)))) {
        _count++;
      }
    }

    // Create result array with correct size
    _pairs = new IDCAPair[](_count);

    // Fill result array
    for (uint256 i; i < _length; i++) {
      IDCAPair _pair = IDCAPair(_watchedPairs.at(i));
      if (_shouldSwapPair(_pair)) {
        _pairs[--_count] = _pair;
      }
    }
  }

  function swapPairs(IDCAPair[] calldata _pairsToSwap) external override returns (uint256 _amountSwapped) {
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

  /**
   * This method isn't a view because the Uniswap quoter doesn't support view quotes.
   * Therefore, we highly recommend that this method is not called on-chain.
   */
  function _shouldSwapPair(IDCAPair _pair) internal virtual returns (bool _shouldSwap) {
    IDCAPairSwapHandler.NextSwapInformation memory _nextSwapInformation = _pair.getNextSwapInfo();
    if (_nextSwapInformation.amountOfSwaps == 0) {
      return false;
    } else if (_nextSwapInformation.amountToBeProvidedBySwapper == 0) {
      return true;
    } else {
      IQuoterV2.QuoteExactOutputSingleParams memory _params = IQuoterV2.QuoteExactOutputSingleParams({
        tokenIn: address(_nextSwapInformation.tokenToRewardSwapperWith),
        tokenOut: address(_nextSwapInformation.tokenToBeProvidedBySwapper),
        amount: _nextSwapInformation.amountToBeProvidedBySwapper,
        fee: 3000,
        sqrtPriceLimitX96: 0
      });

      (uint256 _inputNecessary, , , ) = quoter.quoteExactOutputSingle(_params);
      return _nextSwapInformation.amountToRewardSwapperWith >= _inputNecessary;
    }
  }

  function _swap(IDCAPair _pair) internal {
    // Execute the swap, making myself the callee so that the `DCAPairSwapCall` function is called
    _pair.swap(0, 0, address(this), '-');
  }

  // solhint-disable-next-line func-name-mixedcase
  function DCAPairSwapCall(
    address,
    IERC20Detailed _tokenA,
    IERC20Detailed _tokenB,
    uint256,
    uint256,
    bool _isRewardTokenA,
    uint256 _rewardAmount,
    uint256 _amountToProvide,
    bytes calldata
  ) external override {
    if (_amountToProvide > 0) {
      address _tokenIn = _isRewardTokenA ? address(_tokenA) : address(_tokenB);
      address _tokenOut = _isRewardTokenA ? address(_tokenB) : address(_tokenA);

      // Approve the router to spend the specifed `rewardAmount` of tokenIn.
      TransferHelper.safeApprove(_tokenIn, address(swapRouter), _rewardAmount);

      ISwapRouter.ExactOutputSingleParams memory params = ISwapRouter.ExactOutputSingleParams({
        tokenIn: _tokenIn,
        tokenOut: _tokenOut,
        fee: 3000, // Set to 0.3%
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
