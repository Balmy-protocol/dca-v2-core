import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from '@0xged/hardhat-deploy/types';
import { DeterministicFactory, DeterministicFactory__factory } from '@mean-finance/deterministic-factory/typechained';
import { ethers } from 'hardhat';
import { utils } from 'ethers';
import { getCreationCode } from '@test-utils/contracts';
import { DCAHub__factory } from '@typechained';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, governor } = await hre.getNamedAccounts();

  const deployerSigner = await ethers.getSigner(deployer);

  const deterministicFactory = await ethers.getContractAt<DeterministicFactory>(
    DeterministicFactory__factory.abi,
    '0xbb681d77506df5CA21D2214ab3923b4C056aa3e2'
  );

  const SALT = utils.formatBytes32String('MF-DCAV2-DCAHub');

  const timelock = await hre.deployments.get('Timelock');
  const oracleAggregator = await hre.deployments.get('OracleAggregator');
  const permissionsManager = await hre.deployments.get('PermissionsManager');

  const creationCode = getCreationCode({
    bytecode: DCAHub__factory.bytecode,
    constructorArgs: {
      types: ['address', 'address', 'address', 'address'],
      values: [governor, timelock.address, oracleAggregator.address, permissionsManager.address],
    },
  });

  const deploymentAddress = await deterministicFactory.getDeployed(SALT);

  const deploymentTx = await deterministicFactory.connect(deployerSigner).deploy(
    SALT, // SALT
    creationCode,
    0 // Value
  );

  console.log(`deploying "DCAHub" (tx: ${deploymentTx.hash}) at ${deploymentAddress}`);

  const receipt = await deploymentTx.wait();

  const deployment = await hre.deployments.buildDeploymentSubmission({
    name: 'DCAHub',
    contractAddress: deploymentAddress,
    options: {
      contract: 'contracts/DCAHub/DCAHub.sol:DCAHub',
      from: deployer,
      args: [governor, timelock.address, oracleAggregator.address, permissionsManager.address],
      log: true,
    },
    receipt,
  });

  await hre.deployments.save('DCAHub', deployment);

  await hre.deployments.execute('DCAHub', { from: deployer }, 'setHub', deploymentAddress);
};
deployFunction.tags = ['DCAHub'];
deployFunction.dependencies = ['OracleAggregator', 'PermissionsManager', 'Timelock'];
export default deployFunction;
