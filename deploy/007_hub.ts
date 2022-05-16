import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from '@0xged/hardhat-deploy/types';
import { DCAHub__factory } from '../typechained';
import { deployThroughDeterministicFactory } from '@mean-finance/deterministic-factory/utils/deployment';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, governor } = await hre.getNamedAccounts();

  const timelock = await hre.deployments.get('Timelock');
  const oracleAggregator = await hre.deployments.get('OracleAggregator');
  const permissionsManager = await hre.deployments.get('PermissionsManager');

  const deployment = await deployThroughDeterministicFactory({
    deployer,
    name: 'DCAHub',
    salt: 'MF-DCAV2-DCAHub',
    contract: 'contracts/DCAHub/DCAHub.sol:DCAHub',
    bytecode: DCAHub__factory.bytecode,
    constructorArgs: {
      types: ['address', 'address', 'address', 'address'],
      values: [governor, timelock.address, oracleAggregator.address, permissionsManager.address],
    },
    log: !process.env.TEST,
    overrides: {
      gasLimit: 6_000_000,
    },
  });

  await hre.deployments.execute('PermissionsManager', { from: deployer }, 'setHub', deployment.address);
};
deployFunction.tags = ['DCAHub'];
deployFunction.dependencies = ['OracleAggregator', 'PermissionsManager', 'Timelock'];
export default deployFunction;
