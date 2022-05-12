import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from '@0xged/hardhat-deploy/types';
import { getCreationCode } from '@test-utils/contracts';
import { DCAPermissionsManager__factory } from '@typechained';
import { DeterministicFactory, DeterministicFactory__factory } from '@mean-finance/deterministic-factory/typechained';
import { utils } from 'ethers';
import { ethers } from 'hardhat';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, governor } = await hre.getNamedAccounts();

  const deterministicFactory = await ethers.getContractAt<DeterministicFactory>(
    DeterministicFactory__factory.abi,
    '0xbb681d77506df5CA21D2214ab3923b4C056aa3e2'
  );

  const SALT = utils.formatBytes32String('MF-DCAV2-DCAPermissionsManager');

  const tokenDescriptor = await hre.deployments.get('TokenDescriptor');

  const creationCode = getCreationCode({
    bytecode: DCAPermissionsManager__factory.bytecode,
    constructorArgs: {
      types: ['address', 'address'],
      values: [governor, tokenDescriptor.address],
    },
  });

  const deploymentTx = await deterministicFactory.deploy(
    SALT, // SALT
    creationCode,
    0 // Value
  );

  const receipt = await deploymentTx.wait();

  const deployment = await hre.deployments.buildDeploymentSubmission({
    name: 'DCAPermissionsManager',
    contractAddress: await deterministicFactory.getDeployed(SALT),
    options: {
      contract: 'contracts/DCAPermissionsManager/DCAPermissionsManager.sol:DCAPermissionsManager',
      from: deployer,
      args: [governor, tokenDescriptor.address],
      log: true,
    },
    receipt,
  });

  await hre.deployments.save('TokenDescriptor', deployment);
};

deployFunction.tags = ['PermissionsManager'];
deployFunction.dependencies = ['TokenDescriptor'];
export default deployFunction;
