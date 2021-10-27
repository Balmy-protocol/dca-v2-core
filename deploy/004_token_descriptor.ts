import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  await hre.deployments.deploy('TokenDescriptor', {
    contract: 'contracts/DCATokenDescriptor/DCATokenDescriptor.sol:DCATokenDescriptor',
    from: deployer,
    args: [],
    log: true,
  });
};

deployFunction.tags = ['TokenDescriptor'];
deployFunction.dependencies = ['OracleAggregator'];
export default deployFunction;
