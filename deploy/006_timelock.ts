import { HardhatRuntimeEnvironment } from 'hardhat/types';
import TimelockController from '@openzeppelin/contracts/build/contracts/TimelockController.json';
import { DeployFunction } from '@0xged/hardhat-deploy/types';
import moment from 'moment';
import { deployThroughDeterministicFactory } from '@mean-finance/deterministic-factory/utils/deployment';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, governor } = await hre.getNamedAccounts();

  const minDelay = moment.duration('3', 'days').as('seconds');
  const proposers = [governor];
  const executors = [governor];

  await deployThroughDeterministicFactory({
    deployer,
    name: 'Timelock',
    salt: 'MF-DCAV2-Timelock',
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
