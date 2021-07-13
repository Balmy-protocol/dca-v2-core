import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const globalParameters = await hre.deployments.get('GlobalParameters');

  await hre.deployments.deploy('Factory', {
    contract: 'contracts/DCAFactory/DCAFactory.sol:DCAFactory',
    from: deployer,
    args: [globalParameters.address],
    log: true,
  });
};
export default deployFunction;
deployFunction.tags = ['Factory'];
deployFunction.dependencies = ['GlobalParameters'];
