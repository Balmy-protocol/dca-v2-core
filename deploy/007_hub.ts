import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from '@0xged/hardhat-deploy/types';
import { bytecode } from '../artifacts/contracts/DCAHub/DCAHub.sol/DCAHub.json';
import { deployThroughDeterministicFactory } from '@mean-finance/deterministic-factory/utils/deployment';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, msig } = await hre.getNamedAccounts();

  const timelock = await hre.deployments.get('Timelock');
  const oracleAggregator = await hre.deployments.get('OracleAggregator');
  const permissionsManager = await hre.deployments.get('PermissionsManager');

  const deployment = await deployThroughDeterministicFactory({
    deployer,
    name: 'DCAHub',
    salt: 'MF-DCAV2-DCAHub-V2',
    contract: 'contracts/DCAHub/DCAHub.sol:DCAHub',
    bytecode,
    constructorArgs: {
      types: ['address', 'address', 'address', 'address'],
      values: [msig, timelock.address, oracleAggregator.address, permissionsManager.address],
    },
    log: !process.env.TEST,
    overrides: {
      gasLimit: 8_000_000,
    },
  });

  if (deployment.newlyDeployed) await hre.deployments.execute('PermissionsManager', { from: deployer }, 'setHub', deployment.address);
};
deployFunction.tags = ['DCAHub'];
deployFunction.dependencies = ['OracleAggregator', 'PermissionsManager', 'Timelock'];
export default deployFunction;
