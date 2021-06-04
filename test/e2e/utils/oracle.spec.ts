import { TransactionResponse } from '@ethersproject/abstract-provider';
import { Contract, ContractFactory } from '@ethersproject/contracts';
import { BigNumber, utils } from 'ethers';
import { ethers } from 'hardhat';
import { bn, constants, erc20, evm, wallet } from '../../utils';
import { given, then, when } from '../../utils/bdd';
import axios from 'axios';
import { expect } from 'chai';
import { TokenContract } from '../../utils/erc20';

let forkBlockNumber: number;
const uniswapFactoryAddress = '0x1F98431c8aD98523631AE4a59f267346ea31F984';

describe('Oracle', () => {
  let uniswapFactory: Contract;
  let oracleFactory: ContractFactory;
  let oracle: Contract;
  let cmcETHPrice: BigNumber;

  before(async () => {
    oracleFactory = await ethers.getContractFactory('contracts/mocks/utils/Oracle.sol:OracleMock');
    uniswapFactory = await ethers.getContractAt('contracts/interfaces/IUniswapV3Factory.sol:IUniswapV3Factory', uniswapFactoryAddress);
  });

  beforeEach(async () => {
    if (!forkBlockNumber) {
      const cmcReturn = await axios.get(
        `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=ETH&CMC_PRO_API_KEY=${process.env.COINMARKETCAP_API_KEY}&convert=USD`
      );
      cmcETHPrice = utils.parseEther(`${cmcReturn.data.data.ETH.quote.USD.price}`);
      await evm.reset({
        jsonRpcUrl: process.env.MAINNET_HTTPS_URL,
      });
      forkBlockNumber = (await ethers.provider.getBlockNumber()) - 6;
    } else {
      await evm.reset({
        jsonRpcUrl: process.env.MAINNET_HTTPS_URL,
        blockNumber: forkBlockNumber,
      });
    }

    oracle = await oracleFactory.deploy();
  });

  describe('getBestPoolForPair', () => {
    when('there is only one pool of the enabled fees', () => {
      let tokenA: TokenContract;
      let tokenB: TokenContract;
      let poolAddress: string;
      let bestPool: string;
      given(async () => {
        tokenA = await erc20.deploy({
          name: 'Token A',
          symbol: 'TA',
        });
        tokenB = await erc20.deploy({
          name: 'Token B',
          symbol: 'TB',
        });
        poolAddress = await uniswapFactory.callStatic.createPool(tokenA.address, tokenB.address, 3000);
        await uniswapFactory.createPool(tokenA.address, tokenB.address, 3000);
        bestPool = await oracle.getBestPoolForPair(tokenA.address, tokenB.address);
      });
      then('returns that pool', () => {
        expect(bestPool).to.be.equal(poolAddress);
      });
    });
    when('there are multiple pools to chose from', () => {
      then('chooses the best');
    });
  });

  describe('getQuote with pool', () => {
    when('pool is not a uniswap pool', () => {
      let getTWAPTx: Promise<TransactionResponse>;
      given(async () => {
        getTWAPTx = oracle['getQuote(address,address,uint256,address,uint32)'](
          await wallet.generateRandomAddress(),
          constants.NOT_ZERO_ADDRESS,
          0,
          constants.NOT_ZERO_ADDRESS,
          1
        );
      });
      then('call is reverted', async () => {
        await expect(getTWAPTx).to.be.revertedWith('Transaction reverted: function call to a non-contract account');
      });
    });
    when('asking for ticks that pool does not have', () => {
      let getTWAPTx: Promise<TransactionResponse>;
      let poolAddress: string;
      let tokenA: TokenContract;
      let tokenB: TokenContract;
      given(async () => {
        tokenA = await erc20.deploy({
          name: 'Token A',
          symbol: 'TA',
        });
        await tokenA.mint(tokenA.address, utils.parseEther('1000'));
        tokenB = await erc20.deploy({
          name: 'Token B',
          symbol: 'TB',
        });
        await tokenB.mint(tokenB.address, utils.parseEther('1000'));
        poolAddress = await uniswapFactory.callStatic.createPool(tokenA.address, tokenB.address, 3000);
        await uniswapFactory.createPool(tokenA.address, tokenB.address, 3000);
        getTWAPTx = oracle['getQuote(address,address,uint256,address,uint32)'](
          poolAddress,
          tokenA.address,
          utils.parseEther('1'),
          tokenB.address,
          60
        );
      });
      then('tx is reverted with reason', async () => {
        // Reference: https://github.com/Uniswap/uniswap-v3-core/blob/main/contracts/libraries/Oracle.sol#L309
        await expect(getTWAPTx).to.be.revertedWith('I');
      });
    });
    when('pool is valid and have valid ticks', () => {
      let twapETHPrice: BigNumber;
      const priceThreshold = utils.parseEther('15');
      const period = 30;
      given(async () => {
        twapETHPrice = await oracle['getQuote(address,address,uint256,address,uint32)'](
          '0xC2e9F25Be6257c210d7Adf0D4Cd6E3E881ba25f8', // dai-weth 0.3
          '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // weth
          utils.parseEther('1'),
          '0x6b175474e89094c44da98b954eedeac495271d0f', // dai
          period
        );
      });
      then('returns twap', async () => {
        bn.expectToEqualWithThreshold({
          value: twapETHPrice,
          to: cmcETHPrice,
          threshold: priceThreshold,
        });
      });
    });
  });

  describe('getQuote without pool', () => {
    when('there is no best pool', () => {
      let getTWAPTx: Promise<TransactionResponse>;
      given(async () => {
        getTWAPTx = oracle['getQuote(address,uint256,address,uint32)'](constants.NOT_ZERO_ADDRESS, 0, constants.NOT_ZERO_ADDRESS, 1);
      });
      then('call is reverted', async () => {
        await expect(getTWAPTx).to.be.revertedWith('Transaction reverted: function call to a non-contract account');
      });
    });
    when('there is a best pool', () => {
      const bestPool = '0xC2e9F25Be6257c210d7Adf0D4Cd6E3E881ba25f8'; // dai-weth 0.3
      const period = 30;
      let bestPoolPrice: BigNumber;
      let twapETHPrice: BigNumber;
      given(async () => {
        bestPoolPrice = await oracle['getQuote(address,address,uint256,address,uint32)'](
          bestPool,
          '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // weth
          utils.parseEther('1'),
          '0x6b175474e89094c44da98b954eedeac495271d0f', // dai
          period
        );
        twapETHPrice = await oracle['getQuote(address,uint256,address,uint32)'](
          '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // weth
          utils.parseEther('1'),
          '0x6b175474e89094c44da98b954eedeac495271d0f', // dai
          period
        );
      });
      then('selects the best pool to get twap from', () => {
        expect(bestPoolPrice).to.be.equal(twapETHPrice);
      });
    });
  });
});
