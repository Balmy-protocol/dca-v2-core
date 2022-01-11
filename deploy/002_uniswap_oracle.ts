import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { getCreationCode } from '@test-utils/contracts';
import { ethers } from 'hardhat';
import { utils } from 'ethers';
import { bytecode } from '@artifacts/contracts/oracles/UniswapV3Oracle.sol/UniswapV3Oracle.json';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, governor } = await hre.getNamedAccounts();

  const UNISWAP_V3_FACTORY_ADDRESS = '0x1F98431c8aD98523631AE4a59f267346ea31F984';

  await hre.deployments.execute(
    'Factory',
    {
      from: deployer,
      log: true,
    },
    'deploy',
    utils.formatBytes32String('grizz'),
    getCreationCode({
      bytecode,
      constructorArgs: {
        types: ['address', 'address'],
        values: [governor, UNISWAP_V3_FACTORY_ADDRESS],
      },
    })
  );

  const deployment = await hre.deployments.getDeploymentsFromAddress((await ethers.getContract('Factory')).address);

  hre.deployments.save('UniswapOracle', deployment[1]);
};

deployFunction.tags = ['UniswapOracle'];
deployFunction.dependencies = ['ChainlinkOracle'];
export default deployFunction;
