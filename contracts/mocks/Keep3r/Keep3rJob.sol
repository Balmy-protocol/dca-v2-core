//SPDX-License-Identifier: Unlicense
pragma solidity 0.8.4;

import 'hardhat/console.sol';
import '../../Keep3r/Keep3rJob.sol';

contract Keep3rJobMock is Keep3rJob {
  constructor(IKeep3rV1 _keep3rV1) Keep3rJob(_keep3rV1) {}

  function setKeep3rV1(IKeep3rV1 _keep3rV1) external override {
    _setKeep3rV1(_keep3rV1);
  }

  function spendGas(uint256 _amountToSpend, uint256 _gasPrice) external {
    uint256 _initialGas = gasleft();
    keep3rV1.isKeeper(msg.sender); // sets _gasUsed in keep3rV1 contract
    while ((_initialGas - gasleft()) * _gasPrice < _amountToSpend) {}
    _paysKp3rInBondedTokens(msg.sender);
  }

  function paysKp3rInBondedTokens(address _keeper) external {
    _paysKp3rInBondedTokens(_keeper);
  }

  function paysKeeperAmount(address _keeper, uint256 _amount) external {
    _paysKeeperAmount(_keeper, _amount);
  }

  function paysKeeperCredit(
    address _credit,
    address _keeper,
    uint256 _amount
  ) external {
    _paysKeeperCredit(_credit, _keeper, _amount);
  }

  // pays _amount in ETH after execution
  function paysKeeperEth(address _keeper, uint256 _amount) external {
    _paysKeeperEth(_keeper, _amount);
  }
}
