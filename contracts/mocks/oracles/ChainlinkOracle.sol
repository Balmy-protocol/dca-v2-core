// SPDX-License-Identifier: UNLICENSED

pragma solidity >=0.8.7 <0.9.0;

import '../../oracles/ChainlinkOracle.sol';

contract ChainlinkOracleMock is ChainlinkOracle {
  struct MockedPricingPlan {
    PricingPlan plan;
    bool isSet;
  }

  mapping(address => mapping(address => bool)) public addSupportForPairCalled;
  mapping(address => mapping(address => MockedPricingPlan)) private _pricingPlan;

  constructor(
    // solhint-disable-next-line var-name-mixedcase
    address _WETH,
    FeedRegistryInterface _registry,
    uint32 _maxDelay,
    address _governor
  ) ChainlinkOracle(_WETH, _registry, _maxDelay, _governor) {}

  function internalAddSupportForPair(address _tokenA, address _tokenB) external {
    _addSupportForPair(_tokenA, _tokenB);
  }

  function _addSupportForPair(address _tokenA, address _tokenB) internal override {
    addSupportForPairCalled[_tokenA][_tokenB] = true;
    super._addSupportForPair(_tokenA, _tokenB);
  }

  function reset(address _tokenA, address _tokenB) external {
    delete addSupportForPairCalled[_tokenA][_tokenB];
  }

  function setPricingPlan(
    address _tokenA,
    address _tokenB,
    PricingPlan _plan
  ) external {
    (address __tokenA, address __tokenB) = TokenSorting.sortTokens(_tokenA, _tokenB);
    _pricingPlan[__tokenA][__tokenB] = MockedPricingPlan({plan: _plan, isSet: true});
  }

  function intercalCallRegistry(address _quote, address _base) external view returns (uint256) {
    return _callRegistry(_quote, _base);
  }

  function _determinePricingPlan(address _tokenA, address _tokenB) internal view override returns (PricingPlan) {
    (address __tokenA, address __tokenB) = TokenSorting.sortTokens(_tokenA, _tokenB);
    MockedPricingPlan memory _plan = _pricingPlan[__tokenA][__tokenB];
    if (_plan.isSet) {
      return _plan.plan;
    } else {
      return super._determinePricingPlan(__tokenA, __tokenB);
    }
  }

  function isUSD(address _token) external view returns (bool) {
    return _isUSD(_token);
  }
}
