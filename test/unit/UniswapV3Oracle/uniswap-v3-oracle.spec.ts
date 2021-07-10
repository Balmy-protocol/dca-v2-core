import { expect } from 'chai';
import { Contract, ContractFactory } from 'ethers';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { ethers } from 'hardhat';
import { behaviours, constants } from '../../utils';
import { given, then, when } from '../../utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';

describe('UniswapV3Oracle', () => {
  let owner: SignerWithAddress;
  let UniswapV3OracleContract: ContractFactory, UniswapV3FactoryContract: ContractFactory;
  let UniswapV3Oracle: Contract, UniswapV3Factory: Contract;

  before('Setup accounts and contracts', async () => {
    [owner] = await ethers.getSigners();
    UniswapV3FactoryContract = await ethers.getContractFactory('contracts/mocks/UniswapV3Oracle/UniswapV3FactoryMock.sol:UniswapV3FactoryMock');
    UniswapV3OracleContract = await ethers.getContractFactory('contracts/mocks/UniswapV3Oracle/UniswapV3Oracle.sol:UniswapV3OracleMock');
  });

  beforeEach('Deploy and configure', async () => {
    UniswapV3Factory = await UniswapV3FactoryContract.deploy();
    UniswapV3Oracle = await UniswapV3OracleContract.deploy(owner.address, UniswapV3Factory.address);
  });

  describe('constructor', () => {
    when('factory is zero address', () => {
      then('tx is reverted with reason error', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: UniswapV3OracleContract,
          args: [owner.address, constants.ZERO_ADDRESS],
          message: 'ZeroAddress',
        });
      });
    });
    when('all arguments are valid', () => {
      then('factory is set correctly', async () => {
        const factory = await UniswapV3Oracle.factory();
        expect(factory).to.equal(UniswapV3Factory.address);
      });
      then('max period is 20 minutes', async () => {
        const maxPeriod = await UniswapV3Oracle.MAXIMUM_PERIOD();
        expect(maxPeriod).to.equal(20 * 60);
      });
      then('min period is 1 minute', async () => {
        const minPeriod = await UniswapV3Oracle.MINIMUM_PERIOD();
        expect(minPeriod).to.equal(60);
      });
      then('starting period is 5 minutes', async () => {
        const period = await UniswapV3Oracle.period();
        expect(period).to.equal(5 * 60);
      });
    });
  });

  describe('addFeeTier', () => {
    when('fee tier is invalid', () => {
      then('tx is reverted with reason', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: UniswapV3Oracle,
          func: 'addFeeTier',
          args: [20],
          message: 'InvalidFeeTier',
        });
      });
    });
    when('addresses are valid pairs', () => {
      let tx: TransactionResponse;

      given(async () => {
        // This will make the following fee tier valid
        await UniswapV3Factory.setTickSpacing(1);

        tx = await UniswapV3Oracle.addFeeTier(10);
      });

      then('fee tier is added', async () => {
        expect(await UniswapV3Oracle.supportedFeeTiers()).to.eql([10]);
      });

      then('event is emmitted', async () => {
        await expect(tx).to.emit(UniswapV3Oracle, 'AddedFeeTier').withArgs(10);
      });
    });
    behaviours.shouldBeExecutableOnlyByGovernor({
      contract: () => UniswapV3Oracle,
      funcAndSignature: 'addFeeTier(uint24)',
      params: [20],
      governor: () => owner,
    });
  });

  describe('supportsPair', () => {
    const TOKEN_A = '0x0000000000000000000000000000000000000001';
    const TOKEN_B = '0x0000000000000000000000000000000000000002';
    const POOL = '0x0000000000000000000000000000000000000003';
    const FEE = 1000;

    when('no pool exists for pair', () => {
      then('pair is not supported', async () => {
        expect(await UniswapV3Oracle.supportsPair(TOKEN_A, TOKEN_B)).to.be.false;
      });
    });

    when('pool exists for pair on unsupported fie tier', () => {
      given(async () => {
        await UniswapV3Factory.setPool(TOKEN_A, TOKEN_B, FEE, POOL);
      });
      then('pair is not supported', async () => {
        expect(await UniswapV3Oracle.supportsPair(TOKEN_A, TOKEN_B)).to.be.false;
      });
    });

    when('pool exists for pair on supported fie tier', () => {
      given(async () => {
        await UniswapV3Factory.setTickSpacing(1);
        await UniswapV3Factory.setPool(TOKEN_A, TOKEN_B, FEE, POOL);
        await UniswapV3Oracle.addFeeTier(FEE);
      });
      then('pair is marked as supported', async () => {
        expect(await UniswapV3Oracle.supportsPair(TOKEN_A, TOKEN_B)).to.be.true;
      });
    });
  });

  describe('setPeriod', () => {
    when('period is higher than max period', () => {
      then('tx is reverted with reason', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: UniswapV3Oracle,
          func: 'setPeriod',
          args: [20 * 60 + 1],
          message: 'GreaterThanMaximumPeriod',
        });
      });
    });
    when('period is lower than min period', () => {
      then('tx is reverted with reason', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: UniswapV3Oracle,
          func: 'setPeriod',
          args: [60 - 1],
          message: 'LessThanMinimumPeriod',
        });
      });
    });
    when('new period is valid', () => {
      const PERIOD = 6 * 60;

      let tx: TransactionResponse;

      given(async () => {
        tx = await UniswapV3Oracle.setPeriod(PERIOD);
      });

      then('period is set', async () => {
        expect(await UniswapV3Oracle.period()).to.eql(PERIOD);
      });

      then('event is emmitted', async () => {
        await expect(tx).to.emit(UniswapV3Oracle, 'PeriodChanged').withArgs(PERIOD);
      });
    });
    behaviours.shouldBeExecutableOnlyByGovernor({
      contract: () => UniswapV3Oracle,
      funcAndSignature: 'setPeriod(uint32)',
      params: [10 * 60],
      governor: () => owner,
    });
  });
});
