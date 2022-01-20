import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import moment from 'moment';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, governor } = await hre.getNamedAccounts();

  const UNISWAP_V3_FACTORY_ADDRESS = '0x1F98431c8aD98523631AE4a59f267346ea31F984';

  let minimumPeriod: number;
  let maximumPeriod: number;
  switch (hre.network.name) {
    case 'mainnet':
    case 'hardhat':
      minimumPeriod = moment.duration('5', 'minutes').as('seconds');
      maximumPeriod = moment.duration('20', 'minutes').as('seconds');
      break;
    case 'kovan':
      minimumPeriod = moment.duration('5', 'minutes').as('seconds');
      maximumPeriod = moment.duration('20', 'minutes').as('seconds');
      break;
    case 'optimism':
      minimumPeriod = moment.duration('5', 'minutes').as('seconds');
      maximumPeriod = moment.duration('30', 'minutes').as('seconds');
      break;
    case 'optimism-kovan':
      minimumPeriod = moment.duration('5', 'minutes').as('seconds');
      maximumPeriod = moment.duration('30', 'minutes').as('seconds');
      break;
    default:
      throw new Error(`Unsupported chain '${hre.network.name}`);
  }

  await hre.deployments.deploy('UniswapOracle', {
    contract: 'contracts/oracles/UniswapV3Oracle.sol:UniswapV3Oracle',
    from: deployer,
    args: [governor, UNISWAP_V3_FACTORY_ADDRESS, minimumPeriod, maximumPeriod],
    log: true,
  });
};

deployFunction.tags = ['UniswapOracle'];
deployFunction.dependencies = ['ChainlinkOracle'];
export default deployFunction;
