import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, governor } = await hre.getNamedAccounts();

  const tokenDescriptor = await hre.deployments.get('TokenDescriptor');

  await hre.deployments.deploy('PermissionsManager', {
    contract: 'contracts/DCAPermissionsManager/DCAPermissionsManager.sol:DCAPermissionsManager',
    from: deployer,
    args: [governor, tokenDescriptor.address],
    log: true,
  });
};

deployFunction.tags = ['PermissionsManager'];
deployFunction.dependencies = ['TokenDescriptor'];
export default deployFunction;
