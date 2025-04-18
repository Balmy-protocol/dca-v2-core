import { HardhatRuntimeEnvironment } from 'hardhat/types';
import TimelockController from '@openzeppelin/contracts/build/contracts/TimelockController.json';
import { DeployFunction } from '@0xged/hardhat-deploy/types';
import moment from 'moment';
import { deployThroughDeterministicFactory } from '@mean-finance/deterministic-factory/utils/deployment';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, msig } = await hre.getNamedAccounts();

  const minDelay = moment.duration('3', 'days').as('seconds');
  const proposers = [msig];
  const executors = [msig];

  await deployThroughDeterministicFactory({
    deployer,
    name: 'Timelock',
    salt: 'BALMY-DCAV2-Timelock-V1',
    contract: TimelockController,
    bytecode: TimelockController.bytecode,
    constructorArgs: {
      types: ['uint256', 'address[]', 'address[]'],
      values: [minDelay, proposers, executors],
    },
    log: !process.env.TEST,
    overrides: {
      gasLimit: 4_000_000,
    },
  });
};
deployFunction.tags = ['Timelock'];
export default deployFunction;
