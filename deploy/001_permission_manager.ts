import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from '@0xged/hardhat-deploy/types';
import { bytecode } from '../artifacts/contracts/DCAPermissionsManager/DCAPermissionsManager.sol/DCAPermissionsManager.json';
import { deployThroughDeterministicFactory } from '@mean-finance/deterministic-factory/utils/deployment';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, msig } = await hre.getNamedAccounts();

  const tokenDescriptor = await hre.deployments.get('DCAHubPositionDescriptor');

  await deployThroughDeterministicFactory({
    deployer,
    name: 'PermissionsManager',
    salt: 'MF-DCAV2-PermissionsManager-V3',
    contract: 'contracts/DCAPermissionsManager/DCAPermissionsManager.sol:DCAPermissionsManager',
    bytecode,
    constructorArgs: {
      types: ['address', 'address'],
      values: [msig, tokenDescriptor.address],
    },
    log: !process.env.TEST,
    overrides: {
      gasLimit: 4_500_000,
    },
  });
};

deployFunction.tags = ['PermissionsManager'];
deployFunction.dependencies = ['DCAHubPositionDescriptor'];
export default deployFunction;
