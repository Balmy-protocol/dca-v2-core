// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.6;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

interface IKeep3rV1 is IERC20 {
  function name() external returns (string memory);

  // solhint-disable-next-line func-name-mixedcase
  function ETH() external view returns (address);

  function isKeeper(address _keeper) external returns (bool);

  function governance() external view returns (address);

  function isMinKeeper(
    address _keeper,
    uint256 _minBond,
    uint256 _earned,
    uint256 _age
  ) external returns (bool);

  function isBondedKeeper(
    address _keeper,
    address _bond,
    uint256 _minBond,
    uint256 _earned,
    uint256 _age
  ) external returns (bool);

  function addCreditETH(address job) external payable;

  function addCredit(
    address credit,
    address job,
    uint256 amount
  ) external;

  function addKPRCredit(address _job, uint256 _amount) external;

  function addJob(address _job) external;

  function removeJob(address _job) external;

  function addVotes(address voter, uint256 amount) external;

  function removeVotes(address voter, uint256 amount) external;

  function revoke(address keeper) external;

  function worked(address _keeper) external;

  function workReceipt(address _keeper, uint256 _amount) external;

  function receipt(
    address credit,
    address _keeper,
    uint256 _amount
  ) external;

  function receiptETH(address _keeper, uint256 _amount) external;

  function addLiquidityToJob(
    address liquidity,
    address job,
    uint256 amount
  ) external;

  function applyCreditToJob(
    address provider,
    address liquidity,
    address job
  ) external;

  function unbondLiquidityFromJob(
    address liquidity,
    address job,
    uint256 amount
  ) external;

  function removeLiquidityFromJob(address liquidity, address job) external;

  function bonds(address _keeper, address _credit) external view returns (uint256 _amount);

  function jobs(address _job) external view returns (bool);

  function jobList(uint256 _index) external view returns (address _job);

  function credits(address _job, address _credit) external view returns (uint256 _amount);

  function liquidityAccepted(address _liquidity) external view returns (bool);

  function liquidityProvided(
    address _provider,
    address _liquidity,
    address _job
  ) external view returns (uint256 _amount);

  function liquidityApplied(
    address _provider,
    address _liquidity,
    address _job
  ) external view returns (uint256 _amount);

  function liquidityAmount(
    address _provider,
    address _liquidity,
    address _job
  ) external view returns (uint256 _amount);

  function liquidityUnbonding(
    address _provider,
    address _liquidity,
    address _job
  ) external view returns (uint256 _amount);

  function liquidityAmountsUnbonding(
    address _provider,
    address _liquidity,
    address _job
  ) external view returns (uint256 _amount);

  function bond(address bonding, uint256 amount) external;

  function activate(address bonding) external;

  function unbond(address bonding, uint256 amount) external;

  function withdraw(address bonding) external;

  function setGovernance(address _governance) external;

  function acceptGovernance() external;
}
