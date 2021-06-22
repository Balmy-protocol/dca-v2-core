import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers } from 'hardhat';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  // TODO: Enable when oracle is ready
  // await hre.deployments.execute(
  //   'Factory',
  //   { from: deployer },
  //   'createPair',
  //   '0x0000000000000000000000000000000000000001',
  //   '0x0000000000000000000000000000000000000002'
  // );
};
export default deployFunction;
deployFunction.tags = ['WETHDAIPair'];
deployFunction.dependencies = ['Factory'];
deployFunction.runAtTheEnd = true;
