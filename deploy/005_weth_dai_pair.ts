import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers } from 'hardhat';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  // TODO: Set real addresses of weth and dai
  await hre.deployments.execute(
    'Factory',
    { from: deployer },
    'createPair',
    '0xd0a1e359811322d97991e03f863a0c30c2cf029c', // KOVAN WETH
    '0x4f96fe3b7a6cf9725f59d353f723c1bdb64ca6aa' // KOVAN DAI
  );
};
export default deployFunction;
deployFunction.tags = ['WETHDAIPair'];
deployFunction.dependencies = ['Factory'];
deployFunction.runAtTheEnd = true;
