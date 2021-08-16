import { expect } from 'chai';
import { Contract, ContractFactory, utils } from 'ethers';
import { ethers } from 'hardhat';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { constants, erc20, behaviours } from '../../utils';
import { given, then, when } from '../../utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';

describe('DCAFactoryPairsHandler', function () {
  let owner: SignerWithAddress;
  let tokenAContract: Contract, tokenBContract: Contract;
  let DCAGlobalParametersContract: ContractFactory, DCAFactoryPairsHandlerContract: ContractFactory;
  let timeWeightedOracleContract: ContractFactory;
  let DCAGlobalParameters: Contract, DCAFactoryPairsHandler: Contract;
  let timeWeightedOracle: Contract;

  before('Setup accounts and contracts', async () => {
    [owner] = await ethers.getSigners();
    timeWeightedOracleContract = await ethers.getContractFactory('contracts/mocks/DCAPair/TimeWeightedOracleMock.sol:TimeWeightedOracleMock');
    DCAGlobalParametersContract = await ethers.getContractFactory(
      'contracts/mocks/DCAGlobalParameters/DCAGlobalParameters.sol:DCAGlobalParametersMock'
    );
    DCAFactoryPairsHandlerContract = await ethers.getContractFactory(
      'contracts/mocks/DCAFactory/DCAFactoryPairsHandler.sol:DCAFactoryPairsHandlerMock'
    );
  });

  beforeEach('Deploy and configure', async () => {
    tokenAContract = await erc20.deploy({
      name: 'DAI',
      symbol: 'DAI',
      initialAccount: await owner.getAddress(),
      initialAmount: utils.parseEther('1'),
    });
    tokenBContract = await erc20.deploy({
      name: 'DAI2',
      symbol: 'DAI2',
      initialAccount: await owner.getAddress(),
      initialAmount: utils.parseEther('1'),
    });
    timeWeightedOracle = await timeWeightedOracleContract.deploy(0, 0);
    DCAGlobalParameters = await DCAGlobalParametersContract.deploy(
      owner.address,
      owner.address,
      constants.NOT_ZERO_ADDRESS,
      constants.NOT_ZERO_ADDRESS,
      timeWeightedOracle.address
    );

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
          args: [constants.ZERO_ADDRESS, tokenBContract.address],
          message: 'ZeroAddress',
        });
      });
    });
    when('token B is zero address', () => {
      then('tx is reverted with reason', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAFactoryPairsHandler,
          func: 'createPair',
          args: [tokenAContract.address, constants.ZERO_ADDRESS],
          message: 'ZeroAddress',
        });
      });
    });
    when('creating pair for the same token', () => {
      then('tx is reverted with reason', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAFactoryPairsHandler,
          func: 'createPair',
          args: [tokenAContract.address, tokenAContract.address],
          message: 'IdenticalTokens',
        });
      });
    });
    when('pair already exists', () => {
      given(async () => {
        await DCAFactoryPairsHandler.createPair(tokenAContract.address, tokenBContract.address);
      });
      when('sending tokenA first', () => {
        then('tx is reverted with reason', async () => {
          await behaviours.txShouldRevertWithMessage({
            contract: DCAFactoryPairsHandler,
            func: 'createPair',
            args: [tokenAContract.address, tokenBContract.address],
            message: 'PairAlreadyExists',
          });
        });
      });
      when('sending tokenB first', () => {
        then('tx is reverted with reason', async () => {
          await behaviours.txShouldRevertWithMessage({
            contract: DCAFactoryPairsHandler,
            func: 'createPair',
            args: [tokenBContract.address, tokenAContract.address],
            message: 'PairAlreadyExists',
          });
        });
      });
    });
    when('creation data is valid', () => {
      let hipotheticPairAddress: string;
      let createPairTx: TransactionResponse;
      given(async () => {
        hipotheticPairAddress = await DCAFactoryPairsHandler.callStatic.createPair(tokenAContract.address, tokenBContract.address);
        createPairTx = await DCAFactoryPairsHandler.createPair(tokenAContract.address, tokenBContract.address);
      });
      then('creates pair with correct information', async () => {
        const dcaPair = await ethers.getContractAt('contracts/DCAPair/DCAPair.sol:DCAPair', hipotheticPairAddress);
        expect(await dcaPair.globalParameters()).to.equal(DCAGlobalParameters.address);
      });
      then('adds it to the registry', async () => {
        expect(await DCAFactoryPairsHandler.pairByTokens(tokenAContract.address, tokenBContract.address)).to.equal(hipotheticPairAddress);
        expect(await DCAFactoryPairsHandler.pairByTokens(tokenAContract.address, tokenBContract.address)).to.equal(hipotheticPairAddress);
        expect(await DCAFactoryPairsHandler.allPairs()).to.eql([hipotheticPairAddress]);
        expect(await DCAFactoryPairsHandler.isPair(hipotheticPairAddress)).to.be.true;
      });
      then('emits event', async () => {
        const { tokenA, tokenB } = sortTokens(tokenAContract.address, tokenBContract.address);
        await expect(createPairTx).to.emit(DCAFactoryPairsHandler, 'PairCreated').withArgs(tokenA, tokenB, hipotheticPairAddress);
      });
    });
  });

  describe('pairByTokens', () => {
    when('pair for tokenA<->tokenB doesnt exist', () => {
      then('zero address', async () => {
        expect(await DCAFactoryPairsHandler.pairByTokens(tokenAContract.address, tokenBContract.address)).to.equal(constants.ZERO_ADDRESS);
      });
    });
    when('pair for tokenA<->tokenB exists', () => {
      let hipotheticPairAddress: string;
      given(async () => {
        hipotheticPairAddress = await DCAFactoryPairsHandler.callStatic.createPair(tokenAContract.address, tokenBContract.address);
        await DCAFactoryPairsHandler.createPair(tokenAContract.address, tokenBContract.address);
      });
      then('returns correct pair address', async () => {
        expect(await DCAFactoryPairsHandler.pairByTokens(tokenAContract.address, tokenBContract.address)).to.equal(hipotheticPairAddress);
      });
      then('returns the same address if asking for tokenB<->tokenA pair', async () => {
        expect(await DCAFactoryPairsHandler.pairByTokens(tokenBContract.address, tokenAContract.address)).to.equal(hipotheticPairAddress);
      });
    });
  });

  function sortTokens(tokenA: string, tokenB: string): { tokenA: string; tokenB: string } {
    if (tokenA.toLowerCase() < tokenB.toLowerCase()) {
      return {
        tokenA: tokenA,
        tokenB: tokenB,
      };
    } else {
      return {
        tokenA: tokenB,
        tokenB: tokenA,
      };
    }
  }
});
