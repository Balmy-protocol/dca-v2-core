import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, governor, feeRecipient } = await hre.getNamedAccounts();
  console.log('deployer', deployer);
  console.log('governor', governor);

  await hre.deployments.deploy('TokenDescriptor', {
    contract: 'contracts/DCATokenDescriptor/DCATokenDescriptor.sol:DCATokenDescriptor',
    from: deployer,
    args: [],
    log: true,
  });
};
export default deployFunction;
deployFunction.tags = ['TokenDescriptor'];
