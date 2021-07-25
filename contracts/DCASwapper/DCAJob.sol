//SPDX-License-Identifier: Unlicense
pragma solidity 0.8.4;

import '../utils/Governable.sol';

import '../libraries/CommonErrors.sol';

import '../interfaces/IKeep3rV1.sol';
import '../interfaces/IDCASwapper.sol';

interface IDCAJob {
  event Keep3rV1Set(IKeep3rV1 _keep3rV1);

  event SwapperSet(IDCASwapper _swapper);

  error NotAKeeper();

  function keep3rV1() external view returns (IKeep3rV1);

  function swapper() external view returns (IDCASwapper);

  function setKeep3rV1(IKeep3rV1 _keep3rV1) external;

  function setSwapper(IDCASwapper _swapper) external;

  function workable() external returns (IDCASwapper.PairToSwap[] memory);

  function work(IDCASwapper.PairToSwap[] calldata _pairs) external;
}

abstract contract DCAJob is IDCAJob, Governable {
  IKeep3rV1 public override keep3rV1;
  IDCASwapper public override swapper;

  constructor(IKeep3rV1 _keep3rV1, IDCASwapper _swapper) {
    if (address(_keep3rV1) == address(0) || address(_swapper) == address(0)) revert CommonErrors.ZeroAddress();
    keep3rV1 = _keep3rV1;
    swapper = _swapper;
  }

  function setKeep3rV1(IKeep3rV1 _keep3rV1) external override onlyGovernor {
    if (address(_keep3rV1) == address(0)) revert CommonErrors.ZeroAddress();
    keep3rV1 = _keep3rV1;
    emit Keep3rV1Set(_keep3rV1);
  }

  function setSwapper(IDCASwapper _swapper) external override onlyGovernor {
    if (address(_swapper) == address(0)) revert CommonErrors.ZeroAddress();
    swapper = _swapper;
    emit SwapperSet(_swapper);
  }

  // This is NEVER meant to be called on chain
  function workable() external override returns (IDCASwapper.PairToSwap[] memory) {
    return swapper.getPairsToSwap();
  }

  function work(IDCASwapper.PairToSwap[] calldata _pairs) external override {
    if (!keep3rV1.isKeeper(msg.sender)) revert NotAKeeper();
    swapper.swapPairs(_pairs);
    keep3rV1.worked(msg.sender);
  }
}
