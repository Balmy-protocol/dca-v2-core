import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import moment from 'moment';
import { BigNumber, BigNumberish } from 'ethers';
import { networkBeingForked } from '@test-utils/evm';
import { ethers } from 'hardhat';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, governor } = await hre.getNamedAccounts();

  let weth: string;
  let maxDelay: BigNumberish;

  const registry: string = (await hre.deployments.get('FeedRegistry')).address;
  const network = hre.network.name !== 'hardhat' ? hre.network.name : networkBeingForked ?? hre.network.name;
  switch (network) {
    case 'mainnet':
    case 'hardhat':
      weth = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
      maxDelay = moment.duration('1', 'day').asSeconds();
      break;
    case 'kovan':
      weth = '0xd0a1e359811322d97991e03f863a0c30c2cf029c';
      maxDelay = BigNumber.from(2).pow(32).sub(1); // Max possible
      break;
    case 'optimism-kovan':
      weth = '0x4200000000000000000000000000000000000006';
      maxDelay = BigNumber.from(2).pow(32).sub(1); // Max possible
      break;
    case 'optimism':
      weth = '0x4200000000000000000000000000000000000006';
      maxDelay = moment.duration('1', 'day').asSeconds();
      break;
    case 'mumbai':
      weth = '0xA6FA4fB5f76172d178d61B04b0ecd319C5d1C0aa';
      maxDelay = BigNumber.from(2).pow(32).sub(1); // Max possible
      break;
    case 'polygon':
      weth = '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619';
      maxDelay = moment.duration('1', 'day').asSeconds();
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
