import { Contract, ContractFactory } from '@ethersproject/contracts';
import { utils } from 'ethers';
import { ethers } from 'hardhat';
import { constants, evm } from '../../utils';
import { then, when } from '../../utils/bdd';

const forkBlockNumber = 12529675;
const uniswapFactoryAddress = '0x1F98431c8aD98523631AE4a59f267346ea31F984';

describe('Oracle', () => {
  let uniswapFactory: Contract;
  let oracleFactory: ContractFactory;
  let oracle: Contract;

  before(async () => {
    oracleFactory = await ethers.getContractFactory('contracts/utils/Oracle.sol:Oracle');
    uniswapFactory = await ethers.getContractAt('contracts/interfaces/IUniswapV3Factory.sol:IUniswapV3Factory', uniswapFactoryAddress);
  });

  beforeEach(async () => {
    await evm.reset({
      jsonRpcUrl: process.env.MAINNET_HTTPS_URL,
      blockNumber: forkBlockNumber,
    });

    oracle = await oracleFactory.deploy();
  });

  describe('getTwap', () => {
    when('pool is not a uniswap pool', () => {
      then('call is reverted');
    });
    when('asking for ticks that pool does not have', () => {});
    when('pool is valid and have valid ticks', () => {
      then('returns twap', async () => {
        console.log(
          utils.formatEther(
            await oracle.getTwap(
              '0x60594a405d53811d3BC4766596EFD80fd545A270', // dai-weth 0.05%
              '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // weth
              utils.parseEther('1'),
              '0x6b175474e89094c44da98b954eedeac495271d0f', // dai
              60 // seconds
            )
          )
        );

        console.log(
          utils.formatEther(
            await oracle.getTwap(
              '0xC2e9F25Be6257c210d7Adf0D4Cd6E3E881ba25f8', // dai-weth 0.3
              '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // weth
              utils.parseEther('1'),
              '0x6b175474e89094c44da98b954eedeac495271d0f', // dai
              60 // seconds
            )
          )
        );

        console.log(
          utils.formatEther(
            await oracle.getTwap(
              '0xa80964C5bBd1A0E95777094420555fead1A26c1e', // dai-weth 1%
              '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // weth
              utils.parseEther('1'),
              '0x6b175474e89094c44da98b954eedeac495271d0f', // dai
              60 // seconds
            )
          )
        );
      });
    });
  });
});

// console.log('dai-weth 0.05%',
//   await uniswapFactory.getPool(
//     '0x6b175474e89094c44da98b954eedeac495271d0f', // dai
//     '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // weth
//     500
//   )
// );
// console.log('dai-weth 0.3%',
//   await uniswapFactory.getPool(
//     '0x6b175474e89094c44da98b954eedeac495271d0f', // dai
//     '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // weth
//     3000
//   )
// );
// console.log('dai-weth 1%',
//   await uniswapFactory.getPool(
//     '0x6b175474e89094c44da98b954eedeac495271d0f', // dai
//     '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // weth
//     10000
//   )
// );
