import { BigNumber } from '@ethersproject/bignumber';
import { ethers, network } from 'hardhat';
import moment from 'moment';
import { abi as FACTORY_ABI } from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Factory.sol/IUniswapV3Factory.json';
import erc20, { TokenContract } from '../../../test/utils/erc20';
import { Contract, utils } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import constants from '../../../test/utils/constants';

enum FeeAmount {
  LOW = 500,
  MEDIUM = 3000,
  HIGH = 10000,
}

const WBTC = '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599';
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const DAI = '0x6b175474e89094c44da98b954eedeac495271d0f';

const randomNumber = (min: number, max: number): number => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

const randomFloat = (min: number, max: number): number => {
  return Math.random() * (max - min + 1) + min;
};

let randomUser: SignerWithAddress;

async function main() {
  const uniswapFactory = await ethers.getContractAt(FACTORY_ABI, '0x1F98431c8aD98523631AE4a59f267346ea31F984');
  const dcaFactory = await ethers.getContract('Factory');
  console.log('dca factory address', dcaFactory.address);
  console.log('dca global parameters', await dcaFactory.globalParameters());
  const [deployer, governor] = await ethers.getSigners();
  [, , , randomUser] = await ethers.getSigners();
  console.log('deployer', deployer.address);
  console.log('governor', governor.address);

  const WETHDAIPool = await uniswapFactory.getPool(WETH, DAI, FeeAmount.MEDIUM);
  console.log('Uniswap WETH<->DAI 0.3%', WETHDAIPool);

  const WETHDAIPoolPairAddress = await dcaFactory.callStatic.createPair(WETH, DAI);
  await dcaFactory.createPair(WETH, DAI);
  console.log('Created DCAPair WETH<->DAI', WETHDAIPoolPairAddress);

  const WBTCDAIPool = await uniswapFactory.getPool(WBTC, DAI, FeeAmount.MEDIUM);
  console.log('Uniswap WBTC<->DAI 0.3%', WBTCDAIPool);

  const WBTCDAIPoolPairAddress = await dcaFactory.callStatic.createPair(WBTC, DAI);
  await dcaFactory.createPair(WBTC, DAI);
  console.log('Created DCAPair WBTC<->DAI', WBTCDAIPoolPairAddress);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
