import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from '@0xged/hardhat-deploy/types';
import { DCAPermissionsManager__factory } from '@typechained';
import { deployThroughDeterministicFactory } from '@mean-finance/deterministic-factory/utils/deployment';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, governor } = await hre.getNamedAccounts();

  const tokenDescriptor = await hre.deployments.get('TokenDescriptor');

  await deployThroughDeterministicFactory({
    deployer,
    name: 'PermissionsManager',
    salt: 'MF-DCAV2-PermissionsManager',
    contract: 'contracts/DCAPermissionsManager/DCAPermissionsManager.sol:DCAPermissionsManager',
    bytecode: DCAPermissionsManager__factory.bytecode,
    constructorArgs: {
      types: ['address', 'address'],
      values: [governor, tokenDescriptor.address],
    },
  });
};

deployFunction.tags = ['PermissionsManager'];
deployFunction.dependencies = ['TokenDescriptor'];
export default deployFunction;
