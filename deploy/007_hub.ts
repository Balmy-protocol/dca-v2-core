import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, governor } = await hre.getNamedAccounts();

  const timelock = await hre.deployments.get('Timelock');
  const oracleAggregator = await hre.deployments.get('OracleAggregator');
  const permissionsManager = await hre.deployments.get('PermissionsManager');

  const deployedHub = await hre.deployments.deploy('DCAHub', {
    contract: 'contracts/DCAHub/DCAHub.sol:DCAHub',
    from: deployer,
    args: [governor, timelock.address, oracleAggregator.address, permissionsManager.address],
    log: true,
  });

  await hre.deployments.execute('PermissionsManager', { from: deployer }, 'setHub', deployedHub.address);
};
deployFunction.tags = ['DCAHub'];
deployFunction.dependencies = ['OracleAggregator', 'PermissionsManager', 'Timelock'];
export default deployFunction;
