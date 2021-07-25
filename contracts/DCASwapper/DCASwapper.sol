// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.4;

import '@openzeppelin/contracts/utils/structs/EnumerableSet.sol';
import '@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol';
import '@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol';
import '../utils/Governable.sol';
import '../interfaces/IDCASwapper.sol';
import '../interfaces/IDCAPairSwapCallee.sol';
import '../libraries/CommonErrors.sol';

contract DCASwapper is IDCASwapper, Governable, IDCAPairSwapCallee {
  using EnumerableSet for EnumerableSet.AddressSet;

  // solhint-disable-next-line var-name-mixedcase
  uint24[] private _FEE_TIERS = [500, 3000, 10000];
  IDCAFactory public immutable override factory;
  ISwapRouter public immutable override swapRouter;
  ICustomQuoter public immutable override quoter;
  EnumerableSet.AddressSet internal _watchedPairs;

  constructor(
    address _governor,
    IDCAFactory _factory,
    ISwapRouter _swapRouter,
    ICustomQuoter _quoter
  ) Governable(_governor) {
    if (address(_factory) == address(0) || address(_swapRouter) == address(0) || address(_quoter) == address(0))
      revert CommonErrors.ZeroAddress();
    factory = _factory;
    swapRouter = _swapRouter;
    quoter = _quoter;
  }

  function startWatchingPairs(address[] calldata _pairs) external override onlyGovernor {
    for (uint256 i; i < _pairs.length; i++) {
      if (!factory.isPair(_pairs[i])) revert InvalidPairAddress();
      _watchedPairs.add(_pairs[i]);
    }
    emit WatchingNewPairs(_pairs);
  }

  function stopWatchingPairs(address[] calldata _pairs) external override onlyGovernor {
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
  function getPairsToSwap() external override returns (PairToSwap[] memory _pairs) {
    uint256 _count;

    // Count how many pairs can be swapped
    uint256 _length = _watchedPairs.length();
    for (uint256 i; i < _length; i++) {
      if (bestFeeTierForSwap(IDCAPair(_watchedPairs.at(i))) > 0) {
        _count++;
      }
    }

    // Create result array with correct size
    _pairs = new PairToSwap[](_count);

    // Fill result array
    for (uint256 i; i < _length; i++) {
      IDCAPair _pair = IDCAPair(_watchedPairs.at(i));
      uint24 _feeTier = bestFeeTierForSwap(_pair);
      if (_feeTier > 0) {
        _pairs[--_count] = PairToSwap({pair: _pair, bestFeeTier: _feeTier});
      }
    }
  }

  function swapPairs(PairToSwap[] calldata _pairsToSwap) external override returns (uint256 _amountSwapped) {
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

  function die(address _to) external override onlyGovernor {
    selfdestruct(payable(_to));
  }

  /**
   * This method isn't a view because the Uniswap quoter doesn't support view quotes.
   * Therefore, we highly recommend that this method is not called on-chain.
   * This method will return 0 if the pair should not be swapped, and max(uint24) if there is no need to go to Uniswap
   */
  function bestFeeTierForSwap(IDCAPair _pair) public virtual override returns (uint24 _feeTier) {
    IDCAPairSwapHandler.NextSwapInformation memory _nextSwapInformation = _pair.getNextSwapInfo();
    if (_nextSwapInformation.amountOfSwaps == 0) {
      return 0;
    } else if (_nextSwapInformation.amountToBeProvidedBySwapper == 0) {
      return type(uint24).max;
    } else {
      uint256 _minNecessary = 0;
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
    }
  }

  function _swap(PairToSwap memory _pair) internal {
    // Execute the swap, making myself the callee so that the `DCAPairSwapCall` function is called
    _pair.pair.swap(0, 0, address(this), abi.encode(_pair.bestFeeTier));
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
