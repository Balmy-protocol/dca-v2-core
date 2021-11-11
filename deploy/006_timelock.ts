import { HardhatRuntimeEnvironment } from 'hardhat/types';
import TimelockController from '@openzeppelin/contracts/build/contracts/TimelockController.json';
import { DeployFunction } from 'hardhat-deploy/types';
import moment from 'moment';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, governor } = await hre.getNamedAccounts();
  const alreadyDeployedNetworks = ['mainnet', 'rinkeby', 'kovan', 'ropsten', 'goerli'];

  if (alreadyDeployedNetworks.includes(hre.network.name)) {
    // Re-use already deployed timelock
    await hre.deployments.save('Timelock', { abi: TimelockController.abi, address: '0x763BB5611A7e748f8434Ca69EDabE128bEcF9578' });
  } else {
    const minDelay = moment.duration('3', 'days').as('seconds');
    const proposers = [governor];
    const executors = [governor];

    await hre.deployments.deploy('Timelock', {
      contract: TimelockController,
      from: deployer,
      args: [minDelay, proposers, executors],
      log: true,
    });
  }
};
deployFunction.tags = ['Timelock'];
export default deployFunction;
