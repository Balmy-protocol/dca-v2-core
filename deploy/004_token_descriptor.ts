import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from '@0xged/hardhat-deploy/types';
import { DCATokenDescriptor__factory } from '../typechained';
import { deployThroughDeterministicFactory } from '@mean-finance/deterministic-factory/utils/deployment';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  await deployThroughDeterministicFactory({
    deployer,
    name: 'TokenDescriptor',
    salt: 'MF-DCAV2-DCATokenDescriptor',
    contract: 'contracts/DCATokenDescriptor/DCATokenDescriptor.sol:DCATokenDescriptor',
    bytecode: DCATokenDescriptor__factory.bytecode,
    constructorArgs: {
      types: [],
      values: [],
    },
    overrides: {
      gasLimit: 5_800_000,
    },
  });
};

deployFunction.tags = ['TokenDescriptor'];
deployFunction.dependencies = ['OracleAggregator'];
export default deployFunction;
