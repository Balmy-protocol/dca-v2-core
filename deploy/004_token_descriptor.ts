import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from '@0xged/hardhat-deploy/types';
import { ethers } from 'hardhat';
import { DeterministicFactory, DeterministicFactory__factory } from '@mean-finance/deterministic-factory/typechained';
import { DCATokenDescriptor__factory } from '@typechained';
import { getCreationCode } from '@test-utils/contracts';
import { utils } from 'ethers';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const deployerSigner = await ethers.getSigner(deployer);

  const deterministicFactory = await ethers.getContractAt<DeterministicFactory>(
    DeterministicFactory__factory.abi,
    '0xbb681d77506df5CA21D2214ab3923b4C056aa3e2'
  );

  const SALT = utils.formatBytes32String('MF-DCAV2-DCATokenDescriptor');

  const creationCode = getCreationCode({
    bytecode: DCATokenDescriptor__factory.bytecode,
    constructorArgs: {
      types: [],
      values: [],
    },
  });

  const deploymentAddress = await deterministicFactory.getDeployed(SALT);

  const deploymentTx = await deterministicFactory.connect(deployerSigner).deploy(
    SALT, // SALT
    creationCode,
    0 // Value
  );

  console.log(`deploying "DCATokenDescriptor" (tx: ${deploymentTx.hash}) at ${deploymentAddress}`);

  const receipt = await deploymentTx.wait();

  const deployment = await hre.deployments.buildDeploymentSubmission({
    name: 'DCATokenDescriptor',
    contractAddress: deploymentAddress,
    options: {
      contract: 'contracts/DCATokenDescriptor/DCATokenDescriptor.sol:DCATokenDescriptor',
      from: deployer,
      args: [],
      log: true,
    },
    receipt,
  });

  await hre.deployments.save('TokenDescriptor', deployment);
};

deployFunction.tags = ['TokenDescriptor'];
deployFunction.dependencies = ['OracleAggregator'];
export default deployFunction;
