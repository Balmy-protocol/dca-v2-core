import { expect } from 'chai';
import { Contract, ContractFactory, Signer, utils } from 'ethers';
import { ethers } from 'hardhat';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { constants, erc20, behaviours } from '../../utils';
import { given, then, when } from '../../utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

describe('DCAFactoryPairsHandler', function () {
  let owner: SignerWithAddress, feeRecipient: Signer;
  let tokenA: Contract, tokenB: Contract;
  let DCAFactoryPairsHandlerContract: ContractFactory;
  let DCAFactoryPairsHandler: Contract;

  before('Setup accounts and contracts', async () => {
    [owner, feeRecipient] = await ethers.getSigners();
    DCAFactoryPairsHandlerContract = await ethers.getContractFactory(
      'contracts/mocks/DCAFactory/DCAFactoryPairsHandler.sol:DCAFactoryPairsHandlerMock'
    );
  });

  beforeEach('Deploy and configure', async () => {
    tokenA = await erc20.deploy({
      name: 'DAI',
      symbol: 'DAI',
      initialAccount: await owner.getAddress(),
      initialAmount: utils.parseEther('1'),
    });
    tokenB = await erc20.deploy({
      name: 'DAI2',
      symbol: 'DAI2',
      initialAccount: await owner.getAddress(),
      initialAmount: utils.parseEther('1'),
    });
    DCAFactoryPairsHandler = await DCAFactoryPairsHandlerContract.deploy(owner.address, await feeRecipient.getAddress());
  });

  describe('createPair', () => {
    const allowedIntervals = [1000];
    given(async () => {
      await DCAFactoryPairsHandler.addSwapIntervalsToAllowedList(allowedIntervals);
    });
    when('swap interval is not allowed', () => {
      then('tx is reverted with reason', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAFactoryPairsHandler,
          func: 'createPair',
          args: [tokenA.address, tokenB.address, 1],
          message: 'DCAFactory: interval not allowed',
        });
      });
    });
    when('token A is zero address', () => {
      then('tx is reverted with reason', async () => {
        await behaviours.txShouldRevertWithZeroAddress({
          contract: DCAFactoryPairsHandler,
          func: 'createPair',
          args: [constants.ZERO_ADDRESS, tokenB.address, allowedIntervals[0]],
        });
      });
    });
    when('token B is zero address', () => {
      then('tx is reverted with reason', async () => {
        await behaviours.txShouldRevertWithZeroAddress({
          contract: DCAFactoryPairsHandler,
          func: 'createPair',
          args: [tokenA.address, constants.ZERO_ADDRESS, allowedIntervals[0]],
        });
      });
    });
    when('creating pair for the same token', () => {
      then('tx is reverted with reason', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAFactoryPairsHandler,
          func: 'createPair',
          args: [tokenA.address, tokenA.address, allowedIntervals[0]],
          message: 'DCAFactory: identical addresses',
        });
      });
    });
    when('pair already exists', () => {
      given(async () => {
        await DCAFactoryPairsHandler.createPair(tokenA.address, tokenB.address, allowedIntervals[0]);
      });
      when('sending tokenA first', () => {
        then('tx is reverted with reason', async () => {
          await behaviours.txShouldRevertWithMessage({
            contract: DCAFactoryPairsHandler,
            func: 'createPair',
            args: [tokenA.address, tokenB.address, allowedIntervals[0]],
            message: 'DCAFactory: pair exists',
          });
        });
      });
      when('sending tokenB first', () => {
        then('tx is reverted with reason', async () => {
          await behaviours.txShouldRevertWithMessage({
            contract: DCAFactoryPairsHandler,
            func: 'createPair',
            args: [tokenB.address, tokenA.address, allowedIntervals[0]],
            message: 'DCAFactory: pair exists',
          });
        });
      });
    });
    when('creation data is valid', () => {
      let hipotheticPairAddress: string;
      let createPairTx: TransactionResponse;
      given(async () => {
        hipotheticPairAddress = await DCAFactoryPairsHandler.callStatic.createPair(tokenA.address, tokenB.address, allowedIntervals[0]);
        createPairTx = await DCAFactoryPairsHandler.createPair(tokenA.address, tokenB.address, allowedIntervals[0]);
      });
      then('creates pair with correct information', async () => {
        const dcaPair = await ethers.getContractAt('contracts/DCAPair/DCAPair.sol:DCAPair', hipotheticPairAddress);
        expect(await dcaPair.factory()).to.equal(DCAFactoryPairsHandler.address);
      });
      then('adds it to the registry', async () => {
        expect(await DCAFactoryPairsHandler.getPairByTokensAndSwapInterval(tokenA.address, tokenB.address, allowedIntervals[0])).to.equal(
          hipotheticPairAddress
        );
        expect(await DCAFactoryPairsHandler.getPairsByTokens(tokenA.address, tokenB.address)).to.eql([hipotheticPairAddress]);
        expect(await DCAFactoryPairsHandler.allPairs(0)).to.equal(hipotheticPairAddress);
      });
      then('emits event', async () => {
        const { token0, token1 } = sortTokens(tokenA.address, tokenB.address);
        await expect(createPairTx)
          .to.emit(DCAFactoryPairsHandler, 'PairCreated')
          .withArgs(token0, token1, allowedIntervals[0], hipotheticPairAddress);
      });
    });
  });

  describe('getPairsByTokens', () => {
    when('there are no pairs for tokenA<->tokenB', () => {
      then('returns empty array', async () => {
        expect(await DCAFactoryPairsHandler.getPairsByTokens(tokenA.address, tokenB.address)).to.be.empty;
      });
    });
    when('there are pairs for tokenA<->tokenB', () => {
      let hipotheticPairAddress: string;
      given(async () => {
        await DCAFactoryPairsHandler.addSwapIntervalsToAllowedList([1000]);
        hipotheticPairAddress = await DCAFactoryPairsHandler.callStatic.createPair(tokenA.address, tokenB.address, 1000);
        await DCAFactoryPairsHandler.createPair(tokenA.address, tokenB.address, 1000);
      });
      then('returns correct array of addresses', async () => {
        const { token0, token1 } = sortTokens(tokenA.address, tokenB.address);
        expect(await DCAFactoryPairsHandler.getPairsByTokens(token0, token1)).to.eql([hipotheticPairAddress]);
      });
      then('returns same array of addresses if asking for tokenB<->tokenA pairs', async () => {
        expect(await DCAFactoryPairsHandler.getPairsByTokens(tokenA.address, tokenB.address)).to.eql(
          await DCAFactoryPairsHandler.getPairsByTokens(tokenB.address, tokenA.address)
        );
      });
    });
  });

  describe('getPairByTokensAndSwapInterval', () => {
    when('there is no pair for tokenA<->tokenB and swap interval', () => {
      then('returns empty address', async () => {
        expect(await DCAFactoryPairsHandler.getPairByTokensAndSwapInterval(tokenA.address, tokenB.address, 100)).to.be.equal(
          constants.ZERO_ADDRESS
        );
      });
    });
    when('there is a pair for tokenA<->tokenB but is another interval', () => {
      const swapInterval = 1000;
      given(async () => {
        await DCAFactoryPairsHandler.addSwapIntervalsToAllowedList([swapInterval]);
        await DCAFactoryPairsHandler.createPair(tokenA.address, tokenB.address, swapInterval);
      });
      then('returns empty address', async () => {
        expect(await DCAFactoryPairsHandler.getPairByTokensAndSwapInterval(tokenA.address, tokenB.address, swapInterval + 1)).to.be.equal(
          constants.ZERO_ADDRESS
        );
      });
    });
    when('there is a pair for tokenA<->tokenB and swap interval', () => {
      const swapInterval = 1000;
      let hipotheticPairAddress: string;
      given(async () => {
        await DCAFactoryPairsHandler.addSwapIntervalsToAllowedList([swapInterval]);
        hipotheticPairAddress = await DCAFactoryPairsHandler.callStatic.createPair(tokenA.address, tokenB.address, swapInterval);
        await DCAFactoryPairsHandler.createPair(tokenA.address, tokenB.address, swapInterval);
      });
      then('returns correct address', async () => {
        const { token0, token1 } = sortTokens(tokenA.address, tokenB.address);
        expect(await DCAFactoryPairsHandler.getPairByTokensAndSwapInterval(token0, token1, swapInterval)).to.be.equal(hipotheticPairAddress);
      });
      then('returns same address if asking for tokenB<->tokenA and same swap interval', async () => {
        expect(await DCAFactoryPairsHandler.getPairByTokensAndSwapInterval(tokenA.address, tokenB.address, swapInterval)).to.be.equal(
          await DCAFactoryPairsHandler.getPairByTokensAndSwapInterval(tokenB.address, tokenA.address, swapInterval)
        );
      });
    });
  });

  function sortTokens(tokenA: string, tokenB: string): { token0: string; token1: string } {
    if (tokenA < tokenB) {
      return {
        token0: tokenA,
        token1: tokenB,
      };
    } else {
      return {
        token0: tokenB,
        token1: tokenA,
      };
    }
  }
});
