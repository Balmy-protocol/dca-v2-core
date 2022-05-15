import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from '@0xged/hardhat-deploy/types';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, governor } = await hre.getNamedAccounts();

  const chainlinkOracle = await hre.deployments.get('ChainlinkOracle');
  const uniswapOracle = await hre.deployments.get('UniswapOracle');

  await hre.deployments.deploy('OracleAggregator', {
    contract: 'contracts/oracles/OracleAggregator.sol:OracleAggregator',
    from: deployer,
    args: [chainlinkOracle.address, uniswapOracle.address, governor],
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

deployFunction.tags = ['OracleAggregator'];
deployFunction.dependencies = ['ChainlinkOracle', 'UniswapOracle'];
export default deployFunction;
