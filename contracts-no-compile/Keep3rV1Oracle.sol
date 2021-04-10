contract Keep3rV1Oracle {
  using FixedPoint for *;
  using SafeMath for uint256;

  struct Observation {
    uint256 timestamp;
    uint256 price0Cumulative;
    uint256 price1Cumulative;
  }

  uint256 public minKeep = 200e18;

  modifier keeper() {
    require(KP3R.isMinKeeper(msg.sender, minKeep, 0, 0), '::isKeeper: keeper is not registered');
    _;
  }

  modifier upkeep() {
    uint256 _gasUsed = gasleft();
    require(KP3R.isMinKeeper(msg.sender, minKeep, 0, 0), '::isKeeper: keeper is not registered');
    _;
    uint256 _received = KP3R.KPRH().getQuoteLimit(_gasUsed.sub(gasleft()));
    KP3R.receipt(address(KP3R), address(this), _received);
    _received = _swap(_received);
    msg.sender.transfer(_received);
  }

  address public governance;
  address public pendingGovernance;

  function setMinKeep(uint256 _keep) external {
    require(msg.sender == governance, 'setGovernance: !gov');
    minKeep = _keep;
  }

  /**
   * @notice Allows governance to change governance (for future upgradability)
   * @param _governance new governance address to set
   */
  function setGovernance(address _governance) external {
    require(msg.sender == governance, 'setGovernance: !gov');
    pendingGovernance = _governance;
  }

  /**
   * @notice Allows pendingGovernance to accept their role as governance (protection pattern)
   */
  function acceptGovernance() external {
    require(msg.sender == pendingGovernance, 'acceptGovernance: !pendingGov');
    governance = pendingGovernance;
  }

  IKeep3rV1 public constant KP3R = IKeep3rV1(0x1cEB5cB57C4D4E2b2433641b95Dd330A33185A44);
  WETH9 public constant WETH = WETH9(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
  IUniswapV2Router public constant UNI = IUniswapV2Router(0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D);

  address public constant factory = 0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f;
  // this is redundant with granularity and windowSize, but stored for gas savings & informational purposes.
  uint256 public constant periodSize = 1800;

  address[] internal _pairs;
  mapping(address => bool) internal _known;

  function pairs() external view returns (address[] memory) {
    return _pairs;
  }

  mapping(address => Observation[]) public observations;

  function observationLength(address pair) external view returns (uint256) {
    return observations[pair].length;
  }

  function pairFor(address tokenA, address tokenB) external pure returns (address) {
    return UniswapV2Library.pairFor(factory, tokenA, tokenB);
  }

  function pairForWETH(address tokenA) external pure returns (address) {
    return UniswapV2Library.pairFor(factory, tokenA, address(WETH));
  }

  constructor() public {
    governance = msg.sender;
  }

  function updatePair(address pair) external keeper returns (bool) {
    return _update(pair);
  }

  function update(address tokenA, address tokenB) external keeper returns (bool) {
    address pair = UniswapV2Library.pairFor(factory, tokenA, tokenB);
    return _update(pair);
  }

  function add(address tokenA, address tokenB) external {
    require(msg.sender == governance, 'UniswapV2Oracle::add: !gov');
    address pair = UniswapV2Library.pairFor(factory, tokenA, tokenB);
    require(!_known[pair], 'known');
    _known[pair] = true;
    _pairs.push(pair);

    (uint256 price0Cumulative, uint256 price1Cumulative, ) = UniswapV2OracleLibrary.currentCumulativePrices(pair);
    observations[pair].push(Observation(block.timestamp, price0Cumulative, price1Cumulative));
  }

  function work() public upkeep {
    bool worked = _updateAll();
    require(worked, 'UniswapV2Oracle: !work');
  }

  function workForFree() public keeper {
    bool worked = _updateAll();
    require(worked, 'UniswapV2Oracle: !work');
  }

  function lastObservation(address pair) public view returns (Observation memory) {
    return observations[pair][observations[pair].length - 1];
  }

  function _updateAll() internal returns (bool updated) {
    for (uint256 i = 0; i < _pairs.length; i++) {
      if (_update(_pairs[i])) {
        updated = true;
      }
    }
  }

  function updateFor(uint256 i, uint256 length) external keeper returns (bool updated) {
    for (; i < length; i++) {
      if (_update(_pairs[i])) {
        updated = true;
      }
    }
  }

  function workable(address pair) public view returns (bool) {
    return (block.timestamp - lastObservation(pair).timestamp) > periodSize;
  }

  function workable() external view returns (bool) {
    for (uint256 i = 0; i < _pairs.length; i++) {
      if (workable(_pairs[i])) {
        return true;
      }
    }
    return false;
  }

  function _update(address pair) internal returns (bool) {
    // we only want to commit updates once per period (i.e. windowSize / granularity)
    Observation memory _point = lastObservation(pair);
    uint256 timeElapsed = block.timestamp - _point.timestamp;
    if (timeElapsed > periodSize) {
      (uint256 price0Cumulative, uint256 price1Cumulative, ) = UniswapV2OracleLibrary.currentCumulativePrices(pair);
      observations[pair].push(Observation(block.timestamp, price0Cumulative, price1Cumulative));
      return true;
    }
    return false;
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

  function _valid(address pair, uint256 age) internal view returns (bool) {
    return (block.timestamp - lastObservation(pair).timestamp) <= age;
  }

  function current(
    address tokenIn,
    uint256 amountIn,
    address tokenOut
  ) external view returns (uint256 amountOut) {
    address pair = UniswapV2Library.pairFor(factory, tokenIn, tokenOut);
    require(_valid(pair, periodSize.mul(2)), 'UniswapV2Oracle::quote: stale prices');
    (address token0, ) = UniswapV2Library.sortTokens(tokenIn, tokenOut);

    Observation memory _observation = lastObservation(pair);
    (uint256 price0Cumulative, uint256 price1Cumulative, ) = UniswapV2OracleLibrary.currentCumulativePrices(pair);
    if (block.timestamp == _observation.timestamp) {
      _observation = observations[pair][observations[pair].length - 2];
    }

    uint256 timeElapsed = block.timestamp - _observation.timestamp;
    timeElapsed = timeElapsed == 0 ? 1 : timeElapsed;
    if (token0 == tokenIn) {
      return _computeAmountOut(_observation.price0Cumulative, price0Cumulative, timeElapsed, amountIn);
    } else {
      return _computeAmountOut(_observation.price1Cumulative, price1Cumulative, timeElapsed, amountIn);
    }
  }

  function quote(
    address tokenIn,
    uint256 amountIn,
    address tokenOut,
    uint256 granularity
  ) external view returns (uint256 amountOut) {
    address pair = UniswapV2Library.pairFor(factory, tokenIn, tokenOut);
    require(_valid(pair, periodSize.mul(granularity)), 'UniswapV2Oracle::quote: stale prices');
    (address token0, ) = UniswapV2Library.sortTokens(tokenIn, tokenOut);

    uint256 priceAverageCumulative = 0;
    uint256 length = observations[pair].length - 1;
    uint256 i = length.sub(granularity);

    uint256 nextIndex = 0;
    if (token0 == tokenIn) {
      for (; i < length; i++) {
        nextIndex = i + 1;
        priceAverageCumulative += computeAmountOut(
          observations[pair][i].price0Cumulative,
          observations[pair][nextIndex].price0Cumulative,
          observations[pair][nextIndex].timestamp - observations[pair][i].timestamp,
          amountIn
        );
      }
    } else {
      for (; i < length; i++) {
        nextIndex = i + 1;
        priceAverageCumulative += computeAmountOut(
          observations[pair][i].price1Cumulative,
          observations[pair][nextIndex].price1Cumulative,
          observations[pair][nextIndex].timestamp - observations[pair][i].timestamp,
          amountIn
        );
      }
    }
    return priceAverageCumulative.div(granularity);
  }

  function prices(
    address tokenIn,
    uint256 amountIn,
    address tokenOut,
    uint256 points
  ) external view returns (uint256[] memory) {
    return sample(tokenIn, amountIn, tokenOut, points, 1);
  }

  function sample(
    address tokenIn,
    uint256 amountIn,
    address tokenOut,
    uint256 points,
    uint256 window
  ) public view returns (uint256[] memory) {
    address pair = UniswapV2Library.pairFor(factory, tokenIn, tokenOut);
    (address token0, ) = UniswapV2Library.sortTokens(tokenIn, tokenOut);
    uint256[] memory _prices = new uint256[](points);

    uint256 length = observations[pair].length - 1;
    uint256 i = length.sub(points * window);
    uint256 nextIndex = 0;
    uint256 index = 0;

    if (token0 == tokenIn) {
      for (; i < length; i += window) {
        nextIndex = i + window;
        _prices[index] = computeAmountOut(
          observations[pair][i].price0Cumulative,
          observations[pair][nextIndex].price0Cumulative,
          observations[pair][nextIndex].timestamp - observations[pair][i].timestamp,
          amountIn
        );
        index = index + 1;
      }
    } else {
      for (; i < length; i += window) {
        nextIndex = i + window;
        _prices[index] = computeAmountOut(
          observations[pair][i].price1Cumulative,
          observations[pair][nextIndex].price1Cumulative,
          observations[pair][nextIndex].timestamp - observations[pair][i].timestamp,
          amountIn
        );
        index = index + 1;
      }
    }
    return _prices;
  }

  function hourly(
    address tokenIn,
    uint256 amountIn,
    address tokenOut,
    uint256 points
  ) external view returns (uint256[] memory) {
    return sample(tokenIn, amountIn, tokenOut, points, 2);
  }

  function daily(
    address tokenIn,
    uint256 amountIn,
    address tokenOut,
    uint256 points
  ) external view returns (uint256[] memory) {
    return sample(tokenIn, amountIn, tokenOut, points, 48);
  }

  function weekly(
    address tokenIn,
    uint256 amountIn,
    address tokenOut,
    uint256 points
  ) external view returns (uint256[] memory) {
    return sample(tokenIn, amountIn, tokenOut, points, 336);
  }

  function realizedVolatility(
    address tokenIn,
    uint256 amountIn,
    address tokenOut,
    uint256 points,
    uint256 window
  ) external view returns (uint256) {
    return stddev(sample(tokenIn, amountIn, tokenOut, points, window));
  }

  function realizedVolatilityHourly(
    address tokenIn,
    uint256 amountIn,
    address tokenOut
  ) external view returns (uint256) {
    return stddev(sample(tokenIn, amountIn, tokenOut, 1, 2));
  }

  function realizedVolatilityDaily(
    address tokenIn,
    uint256 amountIn,
    address tokenOut
  ) external view returns (uint256) {
    return stddev(sample(tokenIn, amountIn, tokenOut, 1, 48));
  }

  function realizedVolatilityWeekly(
    address tokenIn,
    uint256 amountIn,
    address tokenOut
  ) external view returns (uint256) {
    return stddev(sample(tokenIn, amountIn, tokenOut, 1, 336));
  }

  /**
   * @dev sqrt calculates the square root of a given number x
   * @dev for precision into decimals the number must first
   * @dev be multiplied by the precision factor desired
   * @param x uint256 number for the calculation of square root
   */
  function sqrt(uint256 x) public pure returns (uint256) {
    uint256 c = (x + 1) / 2;
    uint256 b = x;
    while (c < b) {
      b = c;
      c = (x / c + c) / 2;
    }
    return b;
  }

  /**
   * @dev stddev calculates the standard deviation for an array of integers
   * @dev precision is the same as sqrt above meaning for higher precision
   * @dev the decimal place must be moved prior to passing the params
   * @param numbers uint[] array of numbers to be used in calculation
   */
  function stddev(uint256[] memory numbers) public pure returns (uint256 sd) {
    uint256 sum = 0;
    for (uint256 i = 0; i < numbers.length; i++) {
      sum += numbers[i];
    }
    uint256 mean = sum / numbers.length; // Integral value; float not supported in Solidity
    sum = 0;
    uint256 i;
    for (i = 0; i < numbers.length; i++) {
      sum += (numbers[i] - mean)**2;
    }
    sd = sqrt(sum / (numbers.length - 1)); //Integral value; float not supported in Solidity
    return sd;
  }

  /**
   * @dev blackScholesEstimate calculates a rough price estimate for an ATM option
   * @dev input parameters should be transformed prior to being passed to the function
   * @dev so as to remove decimal places otherwise results will be far less accurate
   * @param _vol uint256 volatility of the underlying converted to remove decimals
   * @param _underlying uint256 price of the underlying asset
   * @param _time uint256 days to expiration in years multiplied to remove decimals
   */
  function blackScholesEstimate(
    uint256 _vol,
    uint256 _underlying,
    uint256 _time
  ) public pure returns (uint256 estimate) {
    estimate = 40 * _vol * _underlying * sqrt(_time);
    return estimate;
  }

  /**
   * @dev fromReturnsBSestimate first calculates the stddev of an array of price returns
   * @dev then uses that as the volatility param for the blackScholesEstimate
   * @param _numbers uint256[] array of price returns for volatility calculation
   * @param _underlying uint256 price of the underlying asset
   * @param _time uint256 days to expiration in years multiplied to remove decimals
   */
  function retBasedBlackScholesEstimate(
    uint256[] memory _numbers,
    uint256 _underlying,
    uint256 _time
  ) public pure {
    uint256 _vol = stddev(_numbers);
    blackScholesEstimate(_vol, _underlying, _time);
  }

  receive() external payable {}

  function _swap(uint256 _amount) internal returns (uint256) {
    KP3R.approve(address(UNI), _amount);

    address[] memory path = new address[](2);
    path[0] = address(KP3R);
    path[1] = address(WETH);

    uint256[] memory amounts = UNI.swapExactTokensForTokens(_amount, uint256(0), path, address(this), now.add(1800));
    WETH.withdraw(amounts[1]);
    return amounts[1];
  }
}
