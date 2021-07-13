import { HardhatRuntimeEnvironment } from 'hardhat/types';
import TimelockController from '@openzeppelin/contracts/build/contracts/TimelockController.json';
import { DeployFunction } from 'hardhat-deploy/types';
import moment from 'moment';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, governor } = await hre.getNamedAccounts();

  const minDelay = moment.duration('3', 'days').as('seconds');
  const proposers = [governor];
  const executors = [governor];

  await hre.deployments.deploy('Timelock', {
    contract: TimelockController,
    from: deployer,
    args: [minDelay, proposers, executors],
    log: true,
  });
};
export default deployFunction;
deployFunction.tags = ['Timelock'];
