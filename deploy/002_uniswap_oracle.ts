import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, governor } = await hre.getNamedAccounts();

  const UNISWAP_V3_FACTORY_ADDRESS = '0x1F98431c8aD98523631AE4a59f267346ea31F984';

  await hre.deployments.deploy('UniswapOracle', {
    contract: 'contracts/oracles/UniswapV3Oracle.sol:UniswapV3Oracle',
    from: deployer,
    args: [governor, UNISWAP_V3_FACTORY_ADDRESS],
    log: true,
  });
};

deployFunction.tags = ['UniswapOracle'];
deployFunction.dependencies = ['ChainlinkOracle'];
export default deployFunction;
