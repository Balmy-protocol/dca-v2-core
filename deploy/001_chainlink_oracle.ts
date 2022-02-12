import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import moment from 'moment';
import { BigNumber, BigNumberish } from 'ethers';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, governor } = await hre.getNamedAccounts();

  let registry: string;
  let weth: string;
  let maxDelay: BigNumberish;

  switch (hre.network.name) {
    case 'mainnet':
    case 'hardhat':
      registry = '0x47Fb2585D2C56Fe188D0E6ec628a38b74fCeeeDf';
      weth = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
      maxDelay = moment.duration('1', 'day').asSeconds();
      break;
    case 'kovan':
      registry = '0xAa7F6f7f507457a1EE157fE97F6c7DB2BEec5cD0';
      weth = '0xd0a1e359811322d97991e03f863a0c30c2cf029c';
      maxDelay = BigNumber.from(2).pow(32).sub(1); // Max possible
      break;
    case 'optimism-kovan':
      registry = '0x2dfb2c5c013826a0728440d8036305b254ad9cce';
      weth = '0x4200000000000000000000000000000000000006';
      maxDelay = BigNumber.from(2).pow(32).sub(1); // Max possible
      break;
    case 'optimism':
      registry = '0x2dfb2c5c013826a0728440d8036305b254ad9cce';
      weth = '0x4200000000000000000000000000000000000006';
      maxDelay = moment.duration('1', 'day').asSeconds();
      break;
    case 'mumbai':
      registry = '0x2dfb2c5c013826a0728440d8036305b254ad9cce';
      weth = '0xA6FA4fB5f76172d178d61B04b0ecd319C5d1C0aa';
      maxDelay = BigNumber.from(2).pow(32).sub(1); // Max possible
      break;
    default:
      throw new Error(`Unsupported chain '${hre.network.name}`);
  }

  await hre.deployments.deploy('ChainlinkOracle', {
    contract: 'contracts/oracles/ChainlinkOracle.sol:ChainlinkOracle',
    from: deployer,
    args: [weth, registry, maxDelay, governor],
    log: true,
  });
};

deployFunction.tags = ['ChainlinkOracle'];
export default deployFunction;
