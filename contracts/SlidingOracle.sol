//SPDX-License-Identifier: Unlicense
pragma solidity 0.7.6;
pragma experimental ABIEncoderV2;

import 'hardhat/console.sol';

import '@openzeppelin/contracts/math/SafeMath.sol';
import '@uniswap/lib/contracts/libraries/FixedPoint.sol';

import './libraries/uniswap/UniswapV2Library.sol';
import './libraries/uniswap/UniswapV2OracleLibrary.sol';

// taken from Keep3r V1 Oracle - https://docs.uniquote.finance/

interface ISlidingOracle {
  function current(
    address _tokenIn,
    uint256 _amountIn,
    address _tokenOut
  ) external view returns (uint256 _amountOut);

  function quote(
    address _tokenIn,
    uint256 _amountIn,
    address _tokenOut,
    uint256 _granularity
  ) external view returns (uint256 _amountOut);
}

contract SimplifiedSlidingOracle {
  using FixedPoint for *;
  using SafeMath for uint256;

  address public immutable factory;
  address public immutable pair;
  uint256 public immutable periodSize;

  struct Observation {
    uint256 timestamp;
    uint256 price0Cumulative;
    uint256 price1Cumulative;
  }

  Observation[] public observations;

  constructor(
    address _factory,
    address _pair,
    uint256 _periodSize
  ) {
    factory = _factory;
    pair = _pair;
    periodSize = _periodSize;
  }

  function lastObservation() public view returns (Observation memory) {
    return observations[observations.length - 1];
  }

  function _computeAmountOut(
    uint256 priceCumulativeStart,
    uint256 priceCumulativeEnd,
    uint256 timeElapsed,
    uint256 amountIn
  ) private pure returns (uint256 amountOut) {
    // overflow is desired.
    FixedPoint.uq112x112 memory priceAverage = FixedPoint.uq112x112(uint224((priceCumulativeEnd - priceCumulativeStart) / timeElapsed));
    amountOut = priceAverage.mul(amountIn).decode144();
  }

  function update() public returns (bool) {
    if (observations.length == 0) {
      (uint256 price0Cumulative, uint256 price1Cumulative, ) = UniswapV2OracleLibrary.currentCumulativePrices(pair);
      observations.push(Observation(block.timestamp, price0Cumulative, price1Cumulative));
      return true;
    } else {
      Observation memory _point = lastObservation();
      uint256 _timeElapsed = block.timestamp - _point.timestamp;
      if (_timeElapsed > periodSize) {
        (uint256 price0Cumulative, uint256 price1Cumulative, ) = UniswapV2OracleLibrary.currentCumulativePrices(pair);
        observations.push(Observation(block.timestamp, price0Cumulative, price1Cumulative));
        return true;
      }
    }
    return false;
  }

  function _valid(uint256 _age) internal view returns (bool) {
    return (block.timestamp - lastObservation().timestamp) <= _age;
  }

  function current(
    address _tokenIn,
    uint256 _amountIn,
    address _tokenOut
  ) external view returns (uint256 _amountOut) {
    require(_valid(periodSize.mul(2)), 'UniswapV2Oracle::quote::stale-prices');
    (address _token0, ) = UniswapV2Library.sortTokens(_tokenIn, _tokenOut);

    Observation memory _observation = lastObservation();
    (uint256 _price0Cumulative, uint256 _price1Cumulative, ) = UniswapV2OracleLibrary.currentCumulativePrices(pair);

    if (block.timestamp == _observation.timestamp) {
      _observation = observations[observations.length - 2];
    }

    uint256 _timeElapsed = block.timestamp - _observation.timestamp;
    _timeElapsed = _timeElapsed == 0 ? 1 : _timeElapsed;
    if (_token0 == _tokenIn) {
      return _computeAmountOut(_observation.price0Cumulative, _price0Cumulative, _timeElapsed, _amountIn);
    } else {
      return _computeAmountOut(_observation.price1Cumulative, _price1Cumulative, _timeElapsed, _amountIn);
    }
  }

  function quote(
    address _tokenIn,
    uint256 _amountIn,
    address _tokenOut,
    uint256 _granularity
  ) external view returns (uint256 amountOut) {
    require(_valid(periodSize.mul(_granularity)), 'UniswapV2Oracle::quote::stale-prices');

    (address _token0, ) = UniswapV2Library.sortTokens(_tokenIn, _tokenOut);

    uint256 _priceAverageCumulative = 0;
    uint256 _length = observations.length - 1;
    uint256 _nextIndex = 0;

    if (_token0 == _tokenIn) {
      for (uint256 i = _length.sub(_granularity); i < _length; i++) {
        _nextIndex = i + 1;
        _priceAverageCumulative += _computeAmountOut(
          observations[i].price0Cumulative,
          observations[_nextIndex].price0Cumulative,
          observations[_nextIndex].timestamp - observations[i].timestamp,
          _amountIn
        );
      }
    } else {
      for (uint256 i = _length.sub(_granularity); i < _length; i++) {
        _nextIndex = i + 1;
        _priceAverageCumulative += _computeAmountOut(
          observations[i].price1Cumulative,
          observations[_nextIndex].price1Cumulative,
          observations[_nextIndex].timestamp - observations[i].timestamp,
          _amountIn
        );
      }
    }
    return _priceAverageCumulative.div(_granularity);
  }

  function prices(
    address _tokenIn,
    uint256 _amountIn,
    address _tokenOut,
    uint256 _points
  ) external view returns (uint256[] memory) {
    return sample(_tokenIn, _amountIn, _tokenOut, _points, 1);
  }

  function sample(
    address _tokenIn,
    uint256 _amountIn,
    address _tokenOut,
    uint256 _points,
    uint256 _window
  ) public view returns (uint256[] memory) {
    (address _token0, ) = UniswapV2Library.sortTokens(_tokenIn, _tokenOut);
    uint256[] memory _prices = new uint256[](_points);

    uint256 _length = observations.length - 1;
    uint256 _nextIndex = 0;
    uint256 _index = 0;

    if (_token0 == _tokenIn) {
      for (uint256 i = _length.sub(_points * _window); i < _length; i += _window) {
        _nextIndex = i + _window;
        _prices[_index] = _computeAmountOut(
          observations[i].price0Cumulative,
          observations[_nextIndex].price0Cumulative,
          observations[_nextIndex].timestamp - observations[i].timestamp,
          _amountIn
        );
        _index = _index + 1;
      }
    } else {
      for (uint256 i = _length.sub(_points * _window); i < _length; i += _window) {
        _nextIndex = i + _window;
        _prices[_index] = _computeAmountOut(
          observations[i].price1Cumulative,
          observations[_nextIndex].price1Cumulative,
          observations[_nextIndex].timestamp - observations[i].timestamp,
          _amountIn
        );
        _index = _index + 1;
      }
    }
    return _prices;
  }
}
