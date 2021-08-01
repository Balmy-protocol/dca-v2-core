import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, governor } = await hre.getNamedAccounts();

  const KEEP3R_V1 = '0x1ceb5cb57c4d4e2b2433641b95dd330a33185a44';

  const factory = await hre.deployments.get('Factory');
  const swapper = await hre.deployments.get('DCAUniswapV3Swapper');

  await hre.deployments.deploy('Keep3rJob', {
    contract: 'contracts/DCAKeep3rJob/DCAKeep3rJob.sol:DCAKeep3rJob',
    from: deployer,
    args: [governor, factory.address, KEEP3R_V1, swapper.address],
    log: true,
  });
};
deployFunction.tags = ['Keep3rJob'];
deployFunction.dependencies = ['DCAUniswapV3Swapper'];
export default deployFunction;
