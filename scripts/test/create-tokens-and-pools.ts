import { BigNumber } from '@ethersproject/bignumber';
import { ethers, network } from 'hardhat';
import moment from 'moment';
import { abi as FACTORY_ABI } from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Factory.sol/IUniswapV3Factory.json';
import erc20, { TokenContract } from '../../test/utils/erc20';
import { Contract, utils } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import constants from '../../test/utils/constants';

enum FeeAmount {
  LOW = 500,
  MEDIUM = 3000,
  HIGH = 10000,
}

const AMOUNT_OF_PAIRS = 1;
const SEBI_TEST_ACCOUNT = '0xD04Fc1C35cd00F799d6831E33978F302FE861789';

const randomNumber = (min: number, max: number): number => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

const randomFloat = (min: number, max: number): number => {
  return Math.random() * (max - min + 1) + min;
};

const fiveMinutes = moment.duration('5', 'minutes').as('seconds');
const daily = moment.duration('1', 'days').as('seconds');

let randomUser: SignerWithAddress;

async function main() {
  const uniswapFactory = await ethers.getContractAt(FACTORY_ABI, '0x1f98431c8ad98523631ae4a59f267346ea31f984');
  const dcaFactory = await ethers.getContract('Factory');
  const [deployer, governor] = await ethers.getSigners();
  [, , , randomUser] = await ethers.getSigners();
  console.log('deployer', deployer.address);
  console.log('governor', governor.address);
  console.log('random user', randomUser.address);
  // await network.provider.send("hardhat_setBalance", [deployer.address, '0xffffffffffffffff']);
  // await network.provider.send("hardhat_setBalance", [governor.address, '0xffffffffffffffff']);
  // await network.provider.send("hardhat_setBalance", [randomUser.address, '0xffffffffffffffff']);

  for (let i = 0; i < AMOUNT_OF_PAIRS; i++) {
    const token0 = await erc20.deploy({
      name: `token0-${i}`,
      symbol: `T0-${i}`,
      initialAccount: randomUser.address,
      initialAmount: utils.parseEther('10000000'),
    });
    await token0.mint(governor.address, utils.parseEther('10000000'));
    await token0.mint(deployer.address, utils.parseEther('10000000'));
    await token0.mint(SEBI_TEST_ACCOUNT, utils.parseEther('10000000'));
    console.log('Deployed and minted token0', token0.address);
    const token1 = await erc20.deploy({
      name: `token1-${i}`,
      symbol: `T1-${i}`,
      initialAccount: randomUser.address,
      initialAmount: utils.parseEther('100000000'),
    });
    await token1.mint(governor.address, utils.parseEther('10000000'));
    await token1.mint(deployer.address, utils.parseEther('10000000'));
    await token1.mint(SEBI_TEST_ACCOUNT, utils.parseEther('10000000'));
    console.log('Deployed and minted token1', token1.address);

    const poolAddress = await uniswapFactory.callStatic.createPool(token0.address, token1.address, FeeAmount.MEDIUM);
    await uniswapFactory.createPool(token0.address, token1.address, FeeAmount.MEDIUM);
    console.log('Created pool on uniswap', poolAddress);

    const pairAddress = await dcaFactory.callStatic.createPair(token0.address, token1.address);
    await dcaFactory.createPair(token0.address, token1.address);
    console.log('Created DCAPair', pairAddress);

    // const poolAddress = '0xA1262bf570FCa63B559d1081f3d21FC4Bcef0691';
    // const token0 = await ethers.getContractAt('contracts/mocks/ERC20Mock.sol:ERC20Mock', '0xc11A92b333c9536675ED2bECD96893bf354AF7ce')
    // const token1 = await ethers.getContractAt('contracts/mocks/ERC20Mock.sol:ERC20Mock', '0xE811EaBe476f85DcaB585FB5E51d6405Bb33eE5d')
    // const pairAddress = '0x5D7711793E9B40CE25801ac90EB5ec2999bf5712';
    const pair = await ethers.getContractAt('contracts/DCAPair/DCAPair.sol:DCAPair', pairAddress);

    console.log('Got pair contract');

    const dailyPositionId = await generatePosition(pair, randomNumber(1, 2) == 1 ? token0 : token1, daily);
    console.log('Daily position generated');

    const fiveMinutesPositionId = await generatePosition(pair, randomNumber(1, 2) == 1 ? token0 : token1, fiveMinutes);
    console.log('Ten minutes position generated');

    // logging
    console.log(`T0-${i}`, token0.address);
    console.log(`T1-${i}`, token1.address);
    console.log(`Uniswap Pool (T0-${i} <-> T1-${i})`, poolAddress);
    console.log(`DCA Pair (T0-${i} <-> T1-${i})`, pairAddress);

    console.log('Daily position ID', dailyPositionId);
    console.log('Five minutes position ID', fiveMinutesPositionId);
  }
}

const generatePosition = async (pair: Contract, from: Contract, interval: number): Promise<BigNumber> => {
  const rate = utils.parseEther(`${randomFloat(0, 2).toFixed(5)}`);
  const amountOfSwaps = randomNumber(20, 1000);
  await from.connect(randomUser).approve(pair.address, constants.MAX_UINT_256, { gasLimit: 1000000 });
  const id = await pair.connect(randomUser).callStatic.deposit(from.address, rate, amountOfSwaps, interval, { gasLimit: 2000000 });
  await pair.connect(randomUser).deposit(from.address, rate, amountOfSwaps, interval, { gasLimit: 2000000 });
  return id;
};

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
