import { BigNumber } from '@ethersproject/bignumber';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { ethers } from 'hardhat';
import moment from 'moment';
import { abi as FACTORY_ABI } from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Factory.sol/IUniswapV3Factory.json';
import erc20 from '../../../test/utils/erc20';
import { Contract, utils } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import constants from '../../../test/utils/constants';

enum FeeAmount {
  LOW = 500,
  MEDIUM = 3000,
  HIGH = 10000,
}

const AMOUNT_OF_PAIRS = 1;
const SEBI_TEST_ACCOUNT = '0xD04Fc1C35cd00F799d6831E33978F302FE861789';

let randomUser: SignerWithAddress;

async function main() {
  const uniswapFactory = await ethers.getContractAt(FACTORY_ABI, '0x1f98431c8ad98523631ae4a59f267346ea31f984');
  const dcaFactory = await ethers.getContract('Factory');
  const [deployer, governor] = await ethers.getSigners();
  [, , , randomUser] = await ethers.getSigners();
  console.log('deployer', deployer.address);
  console.log('governor', governor.address);
  console.log('random user', randomUser.address);

  for (let i = 0; i < AMOUNT_OF_PAIRS; i++) {
    const token0 = await erc20.deploy({
      name: `token0-${i}`,
      symbol: `T0-${i}`,
      initialAccount: randomUser.address,
      initialAmount: utils.parseEther('10000000'),
    });
    await token0.mint(governor.address, utils.parseEther('10000000'), { gasLimit: 1000000 });
    await token0.mint(deployer.address, utils.parseEther('10000000'), { gasLimit: 1000000 });
    await token0.mint(SEBI_TEST_ACCOUNT, utils.parseEther('10000000'), { gasLimit: 1000000 });
    console.log('Deployed and minted token0', token0.address);
    const token1 = await erc20.deploy({
      name: `token1-${i}`,
      symbol: `T1-${i}`,
      initialAccount: randomUser.address,
      initialAmount: utils.parseEther('100000000'),
    });
    await token1.mint(governor.address, utils.parseEther('10000000'), { gasLimit: 1000000 });
    await token1.mint(deployer.address, utils.parseEther('10000000'), { gasLimit: 1000000 });
    await token1.mint(SEBI_TEST_ACCOUNT, utils.parseEther('10000000'), { gasLimit: 1000000 });
    console.log('Deployed and minted token1', token1.address);

    const poolAddress = await uniswapFactory.callStatic.createPool(token0.address, token1.address, FeeAmount.MEDIUM);
    (await uniswapFactory.createPool(token0.address, token1.address, FeeAmount.MEDIUM)) as TransactionResponse;

    console.log('Pool on uniswap', poolAddress);
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
