import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { utils } from 'ethers';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  await hre.deployments.deploy('ERC20Mock', {
    from: deployer,
    args: ['name', 'N', 18, deployer, utils.parseEther('1')],
    log: true,
  });
};
export default deployFunction;
deployFunction.tags = ['ERC20Mock'];
