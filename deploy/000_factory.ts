import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  await hre.deployments.deploy('Factory', {
    contract: 'contracts/utils/Factory.sol:Factory',
    from: deployer,
    args: [],
    log: true,
  });
};

deployFunction.tags = ['Factory'];
export default deployFunction;
