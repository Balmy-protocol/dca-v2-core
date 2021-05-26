// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

interface IDCAFactoryParameters {
  event FeeRecipientSet(address _feeRecipient);
  event FeeSet(uint32 _feeSet);
  event SwapIntervalsAllowed(uint32[] _swapIntervals);
  event SwapIntervalsForbidden(uint32[] _swapIntervals);

  /* Public getters */

  function feeRecipient() external view returns (address);

  function fee() external view returns (uint32);

  // solhint-disable-next-line func-name-mixedcase
  function FEE_PRECISION() external view returns (uint24);

  // solhint-disable-next-line func-name-mixedcase
  function MAX_FEE() external view returns (uint32);

  function allowedSwapIntervals() external view returns (uint32[] memory __allowedSwapIntervals); // uint32 is enough for 100 years

  function isSwapIntervalAllowed(uint32 _swapInterval) external view returns (bool);

  /* Public setters */
  function setFeeRecipient(address _feeRecipient) external;

  function setFee(uint32 _fee) external;

  function addSwapIntervalsToAllowedList(uint32[] calldata _swapIntervals) external;

  function removeSwapIntervalsFromAllowedList(uint32[] calldata _swapIntervals) external;
}

interface IDCAFactoryPairsHandler is IDCAFactoryParameters {
  event PairCreated(address indexed _token0, address indexed _token1, uint32 _swapInterval, address _pair);

  function pairByTokensAndSwapInterval(
    address _tokenA,
    address _tokenB,
    uint32 _swapInterval
  ) external view returns (address _pair);

  function getPairByTokensAndSwapInterval(
    address _tokenA,
    address _tokenB,
    uint32 _swapInterval
  ) external view returns (address _pair);

  function getPairsByTokens(address _tokenA, address _tokenB) external view returns (address[] memory _pairs);

  function pairsByTokens(
    address _tokenA,
    address _tokenB,
    uint256 _index
  ) external view returns (address _pair);

  function allPairs(uint256 _pairIndex) external view returns (address pair);

  function createPair(
    address _tokenA,
    address _tokenB,
    uint32 _swapInterval
  ) external returns (address pair);
}

interface IDCAFactory is IDCAFactoryParameters, IDCAFactoryPairsHandler {}
