//SPDX-License-Identifier: Unlicense
pragma solidity 0.8.4;

import '../interfaces/Keep3r/IKeep3rV1.sol';

interface IKeep3rJob {
  event Keep3rV1Set(IKeep3rV1 _keep3rV1);

  function keep3rV1() external view returns (IKeep3rV1);

  function setKeep3rV1(IKeep3rV1 _keep3rV1) external;
}

abstract contract Keep3rJob is IKeep3rJob {
  IKeep3rV1 public override keep3rV1;

  constructor(IKeep3rV1 _keep3rV1) {
    _setKeep3rV1(_keep3rV1);
  }

  function _setKeep3rV1(IKeep3rV1 _keep3rV1) internal {
    require(address(_keep3rV1) != address(0), 'DCAKeep3rJob: zero address');
    keep3rV1 = _keep3rV1;
    emit Keep3rV1Set(_keep3rV1);
  }

  // pays in bonded KP3R after execution
  function _paysKp3rInBondedTokens(address _keeper) internal {
    keep3rV1.worked(_keeper);
  }

  // pays _amount in bonded KP3R after execution
  function _paysKeeperAmount(address _keeper, uint256 _amount) internal {
    keep3rV1.workReceipt(_keeper, _amount);
  }

  // pays _amount in ETH after execution
  function _paysKeeperEth(address _keeper, uint256 _amount) internal {
    keep3rV1.receiptETH(_keeper, _amount);
  }

  // pays _amount in _credit after execution
  function _paysKeeperCredit(
    address _credit,
    address _keeper,
    uint256 _amount
  ) internal {
    keep3rV1.receipt(_credit, _keeper, _amount);
  }
}
