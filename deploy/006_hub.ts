import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, governor } = await hre.getNamedAccounts();

  const TIMELOCK = '0x763BB5611A7e748f8434Ca69EDabE128bEcF9578'; // Will re-use the same one we used for v1
  const oracleAggregator = await hre.deployments.get('OracleAggregator');
  const permissionsManager = await hre.deployments.get('PermissionsManager');

  const deployedHub = await hre.deployments.deploy('DCAHub', {
    contract: 'contracts/DCAHub/DCAHub.sol:DCAHub',
    from: deployer,
    args: [governor, TIMELOCK, oracleAggregator.address, permissionsManager.address],
    log: true,
  });

  await hre.deployments.execute('PermissionsManager', { from: deployer }, 'setHub', deployedHub.address);
};
deployFunction.tags = ['DCAHub'];
deployFunction.dependencies = ['OracleAggregator', 'PermissionsManager'];
export default deployFunction;
