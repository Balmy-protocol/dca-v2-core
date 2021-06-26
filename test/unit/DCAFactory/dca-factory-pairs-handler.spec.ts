import { expect } from 'chai';
import { Contract, ContractFactory, utils } from 'ethers';
import { ethers } from 'hardhat';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { constants, erc20, behaviours } from '../../utils';
import { given, then, when } from '../../utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';

// TODO: unskip
describe.skip('DCAFactoryPairsHandler', function () {
  let owner: SignerWithAddress;
  let tokenA: Contract, tokenB: Contract;
  let DCAGlobalParametersContract: ContractFactory, DCAFactoryPairsHandlerContract: ContractFactory;
  let DCAGlobalParameters: Contract, DCAFactoryPairsHandler: Contract;

  before('Setup accounts and contracts', async () => {
    [owner] = await ethers.getSigners();
    DCAGlobalParametersContract = await ethers.getContractFactory(
      'contracts/mocks/DCAGlobalParameters/DCAGlobalParameters.sol:DCAGlobalParametersMock'
    );
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
    DCAGlobalParameters = await DCAGlobalParametersContract.deploy(owner.address, constants.NOT_ZERO_ADDRESS, constants.NOT_ZERO_ADDRESS);
    DCAFactoryPairsHandler = await DCAFactoryPairsHandlerContract.deploy(DCAGlobalParameters.address);
  });

  describe('constructor', () => {
    when('globalParameters is zero address', () => {
      then('tx is reverted with reason error', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: DCAFactoryPairsHandlerContract,
          args: [constants.ZERO_ADDRESS],
          message: 'ZeroAddress',
        });
      });
    });
    when('all arguments are valid', () => {
      then('globalParameters is set correctly', async () => {
        const globalParameters = await DCAFactoryPairsHandler.globalParameters();
        expect(globalParameters).to.equal(DCAGlobalParameters.address);
      });
    });
  });
  describe('createPair', () => {
    when('token A is zero address', () => {
      then('tx is reverted with reason', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAFactoryPairsHandler,
          func: 'createPair',
          args: [constants.ZERO_ADDRESS, tokenB.address],
          message: 'ZeroAddress',
        });
      });
    });
    when('token B is zero address', () => {
      then('tx is reverted with reason', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAFactoryPairsHandler,
          func: 'createPair',
          args: [tokenA.address, constants.ZERO_ADDRESS],
          message: 'ZeroAddress',
        });
      });
    });
    when('creating pair for the same token', () => {
      then('tx is reverted with reason', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAFactoryPairsHandler,
          func: 'createPair',
          args: [tokenA.address, tokenA.address],
          message: 'IdenticalTokens',
        });
      });
    });
    when('pair already exists', () => {
      given(async () => {
        await DCAFactoryPairsHandler.createPair(tokenA.address, tokenB.address);
      });
      when('sending tokenA first', () => {
        then('tx is reverted with reason', async () => {
          await behaviours.txShouldRevertWithMessage({
            contract: DCAFactoryPairsHandler,
            func: 'createPair',
            args: [tokenA.address, tokenB.address],
            message: 'PairAlreadyExists',
          });
        });
      });
      when('sending tokenB first', () => {
        then('tx is reverted with reason', async () => {
          await behaviours.txShouldRevertWithMessage({
            contract: DCAFactoryPairsHandler,
            func: 'createPair',
            args: [tokenB.address, tokenA.address],
            message: 'PairAlreadyExists',
          });
        });
      });
    });
    when('creation data is valid', () => {
      let hipotheticPairAddress: string;
      let createPairTx: TransactionResponse;
      given(async () => {
        hipotheticPairAddress = await DCAFactoryPairsHandler.callStatic.createPair(tokenA.address, tokenB.address);
        createPairTx = await DCAFactoryPairsHandler.createPair(tokenA.address, tokenB.address);
      });
      then('creates pair with correct information', async () => {
        const dcaPair = await ethers.getContractAt('contracts/DCAPair/DCAPair.sol:DCAPair', hipotheticPairAddress);
        expect(await dcaPair.globalParameters()).to.equal(DCAGlobalParameters.address);
      });
      then('adds it to the registry', async () => {
        expect(await DCAFactoryPairsHandler.pairByTokens(tokenA.address, tokenB.address)).to.equal(hipotheticPairAddress);
        expect(await DCAFactoryPairsHandler.pairByTokens(tokenA.address, tokenB.address)).to.equal(hipotheticPairAddress);
        expect(await DCAFactoryPairsHandler.allPairs(0)).to.equal(hipotheticPairAddress);
      });
      then('emits event', async () => {
        const { token0, token1 } = sortTokens(tokenA.address, tokenB.address);
        await expect(createPairTx).to.emit(DCAFactoryPairsHandler, 'PairCreated').withArgs(token0, token1, hipotheticPairAddress);
      });
    });
  });

  describe('pairByTokens', () => {
    when('pair for tokenA<->tokenB doesnt exist', () => {
      then('zero address', async () => {
        expect(await DCAFactoryPairsHandler.pairByTokens(tokenA.address, tokenB.address)).to.equal(constants.ZERO_ADDRESS);
      });
    });
    when('pair for tokenA<->tokenB exists', () => {
      let hipotheticPairAddress: string;
      given(async () => {
        hipotheticPairAddress = await DCAFactoryPairsHandler.callStatic.createPair(tokenA.address, tokenB.address);
        await DCAFactoryPairsHandler.createPair(tokenA.address, tokenB.address);
      });
      then('returns correct pair address', async () => {
        const { token0, token1 } = sortTokens(tokenA.address, tokenB.address);
        expect(await DCAFactoryPairsHandler.pairByTokens(token0, token1)).to.equal(hipotheticPairAddress);
      });
      then('returns the same address if asking for tokenB<->tokenA pair', async () => {
        expect(await DCAFactoryPairsHandler.pairByTokens(tokenA.address, tokenB.address)).to.equal(
          await DCAFactoryPairsHandler.pairByTokens(tokenB.address, tokenA.address)
        );
      });
    });
  });

  describe('sortTokens', () => {
    when('sorting token addresses', () => {
      let token0: string;
      let token1: string;
      given(async () => {
        [token0, token1] = await DCAFactoryPairsHandler.sortTokens(tokenA.address, tokenB.address);
      });
      then('token0 is correct', () => {
        expect(sortTokens(tokenA.address, tokenB.address).token0).to.equal(token0);
      });
      then('token1 is correct', () => {
        expect(sortTokens(tokenA.address, tokenB.address).token1).to.equal(token1);
      });
    });
    when('calling with inverted order', () => {
      let token0: string;
      let token1: string;
      given(async () => {
        [token0, token1] = await DCAFactoryPairsHandler.sortTokens(tokenA.address, tokenB.address);
      });
      then('token0 is the same', async () => {
        await expect((await DCAFactoryPairsHandler.sortTokens(tokenA.address, tokenB.address))[0]).to.equal(token0);
      });
      then('token1 is the same', async () => {
        await expect((await DCAFactoryPairsHandler.sortTokens(tokenA.address, tokenB.address))[1]).to.equal(token1);
      });
    });
  });

  function sortTokens(tokenA: string, tokenB: string): { token0: string; token1: string } {
    if (tokenA.toLowerCase() < tokenB.toLowerCase()) {
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
