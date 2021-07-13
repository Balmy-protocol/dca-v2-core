import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, governor } = await hre.getNamedAccounts();

  const factory = await hre.deployments.get('Factory');

  await hre.deployments.deploy('Swapper', {
    contract: 'contracts/DCASwapper/DCASwapper.sol:DCASwapper',
    from: deployer,
    args: [governor, factory.address],
    log: true,
  });
};
export default deployFunction;
deployFunction.tags = ['Swapper'];
deployFunction.dependencies = ['Factory'];
