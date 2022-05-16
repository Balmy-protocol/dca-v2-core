import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from '@0xged/hardhat-deploy/types';
import { OracleAggregator__factory } from '@typechained';
import { deployThroughDeterministicFactory } from '@mean-finance/deterministic-factory/utils/deployment';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, governor } = await hre.getNamedAccounts();

  const chainlinkOracle = await hre.deployments.get('ChainlinkOracle');
  const uniswapOracle = await hre.deployments.get('UniswapOracle');

  await deployThroughDeterministicFactory({
    deployer,
    name: 'OracleAggregator',
    salt: 'MF-DCAV2-OracleAggregator',
    contract: 'contracts/oracles/OracleAggregator.sol:OracleAggregator',
    bytecode: OracleAggregator__factory.bytecode,
    constructorArgs: {
      types: ['address', 'address', 'address'],
      values: [chainlinkOracle.address, uniswapOracle.address, governor],
    },
    overrides: {
      gasLimit: 2_500_000,
    },
  });
};

deployFunction.tags = ['OracleAggregator'];
deployFunction.dependencies = ['ChainlinkOracle', 'UniswapOracle'];
export default deployFunction;
