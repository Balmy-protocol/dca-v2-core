import { expect } from 'chai';
import { Contract, ContractFactory } from 'ethers';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { ethers } from 'hardhat';
import { behaviours, constants } from '@test-utils';
import { given, then, when } from '@test-utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import {
  UniswapV3FactoryMock,
  UniswapV3FactoryMock__factory,
  UniswapV3OracleMock,
  UniswapV3OracleMock__factory,
  UniswapV3PoolMock__factory,
} from '@typechained';
import { snapshot } from '@test-utils/evm';

describe('UniswapV3Oracle', () => {
  const TOKEN_A = '0x0000000000000000000000000000000000000001';
  const TOKEN_B = '0x0000000000000000000000000000000000000002';
  const FEE = 1000;
  let owner: SignerWithAddress;
  let UniswapV3OracleContract: UniswapV3OracleMock__factory, UniswapV3FactoryContract: UniswapV3FactoryMock__factory;
  let UniswapV3PoolContract: UniswapV3PoolMock__factory;
  let UniswapV3Oracle: UniswapV3OracleMock, UniswapV3Factory: UniswapV3FactoryMock;
  let snapshotId: string;
  let UniswapV3Pool: Contract, UniswapV3Pool2: Contract;

  before('Setup accounts and contracts', async () => {
    [owner] = await ethers.getSigners();
    UniswapV3FactoryContract = await ethers.getContractFactory('contracts/mocks/UniswapV3Oracle/UniswapV3FactoryMock.sol:UniswapV3FactoryMock');
    UniswapV3PoolContract = await ethers.getContractFactory('contracts/mocks/UniswapV3Oracle/UniswapV3PoolMock.sol:UniswapV3PoolMock');
    UniswapV3OracleContract = await ethers.getContractFactory('contracts/mocks/UniswapV3Oracle/UniswapV3Oracle.sol:UniswapV3OracleMock');
    UniswapV3Factory = await UniswapV3FactoryContract.deploy();
    UniswapV3Oracle = await UniswapV3OracleContract.deploy(owner.address, UniswapV3Factory.address);
    UniswapV3Pool = await UniswapV3PoolContract.deploy();
    UniswapV3Pool2 = await UniswapV3PoolContract.deploy();
    snapshotId = await snapshot.take();
  });

  beforeEach('Deploy and configure', async () => {
    await snapshot.revert(snapshotId);
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
        tx = await supportFieTier(10);
      });

      then('fee tier is added', async () => {
        expect(await UniswapV3Oracle.supportedFeeTiers()).to.eql([10]);
      });

      then('event is emmitted', async () => {
        await expect(tx).to.emit(UniswapV3Oracle, 'AddedFeeTier').withArgs(10);
      });
    });
    when('fee tier is already added', () => {
      let tx: TransactionResponse;
      given(async () => {
        tx = await supportFieTier(10);
      });
      then('tx is reverted with reason', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: UniswapV3Oracle,
          func: 'addFeeTier',
          args: [10],
          message: 'FeeTierAlreadyPresent',
        });
      });
    });
    behaviours.shouldBeExecutableOnlyByGovernor({
      contract: () => UniswapV3Oracle,
      funcAndSignature: 'addFeeTier(uint24)',
      params: [20],
      governor: () => owner,
    });
  });

  describe('canSupportPair', () => {
    when('no pool exists for pair', () => {
      then('pair is not supported', async () => {
        expect(await UniswapV3Oracle.canSupportPair(TOKEN_A, TOKEN_B)).to.be.false;
      });
    });

    when('pool exists for pair on unsupported fie tier', () => {
      given(async () => {
        await UniswapV3Factory.setPool(TOKEN_A, TOKEN_B, FEE, UniswapV3Pool.address);
      });
      then('pair is not supported', async () => {
        expect(await UniswapV3Oracle.canSupportPair(TOKEN_A, TOKEN_B)).to.be.false;
      });
    });

    when('pool exists for pair on supported fie tier', () => {
      given(async () => {
        await supportFieTier(FEE);
        await UniswapV3Factory.setPool(TOKEN_A, TOKEN_B, FEE, UniswapV3Pool.address);
      });
      then('pair is marked as supported', async () => {
        expect(await UniswapV3Oracle.canSupportPair(TOKEN_A, TOKEN_B)).to.be.true;
      });
    });
    when('pool exists for pair on supported fie tier, but liquidity is not enough', () => {
      given(async () => {
        await supportFieTier(FEE);
        await UniswapV3Factory.setPool(TOKEN_A, TOKEN_B, FEE, UniswapV3Pool.address);
        await UniswapV3Pool.setLiquidity(0);
      });
      then('pair is not supported', async () => {
        expect(await UniswapV3Oracle.canSupportPair(TOKEN_A, TOKEN_B)).to.be.false;
      });
    });
    when(`pools exists for pair on supported fie tier, but one of them doesn't have enough liquidity`, () => {
      const FEE_2 = 2000;

      given(async () => {
        await supportFieTier(FEE);
        await UniswapV3Factory.setPool(TOKEN_A, TOKEN_B, FEE, UniswapV3Pool.address);
        await UniswapV3Pool.setLiquidity(0);

        await supportFieTier(FEE_2);
        await UniswapV3Factory.setPool(TOKEN_A, TOKEN_B, FEE_2, UniswapV3Pool2.address);
      });
      then('pair is supported', async () => {
        expect(await UniswapV3Oracle.canSupportPair(TOKEN_A, TOKEN_B)).to.be.true;
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
      funcAndSignature: 'setPeriod(uint16)',
      params: [10 * 60],
      governor: () => owner,
    });
  });

  describe('reconfigureSupportForPair', () => {
    when(`pair's addreses are inverted`, () => {
      given(async () => {
        await supportFieTier(FEE);
        await UniswapV3Factory.setPool(TOKEN_A, TOKEN_B, FEE, UniswapV3Pool.address);
        await UniswapV3Oracle.reconfigureSupportForPair(TOKEN_B, TOKEN_A);
      });

      then(`correct order is sent to internal add support`, async () => {
        expect(await UniswapV3Oracle.addSupportForPairCalled(TOKEN_A, TOKEN_B)).to.be.true;
      });
    });

    when('a new pool is deployed for already supported pair', () => {
      const FEE_2 = 2000;
      let tx: TransactionResponse;
      given(async () => {
        // Support FEE
        await supportFieTier(FEE);
        await UniswapV3Factory.setPool(TOKEN_A, TOKEN_B, FEE, UniswapV3Pool.address);
        await UniswapV3Oracle.internalAddSupportForPair(TOKEN_A, TOKEN_B);
        await UniswapV3Pool.reset();

        // Support FEE_2
        await supportFieTier(FEE_2);
        await UniswapV3Factory.setPool(TOKEN_A, TOKEN_B, FEE_2, UniswapV3Pool2.address);
        tx = await UniswapV3Oracle.reconfigureSupportForPair(TOKEN_A, TOKEN_B);
      });

      then(`it is added to list of pair's list of pools`, async () => {
        expect(await UniswapV3Oracle.poolsUsedForPair(TOKEN_A, TOKEN_B)).to.eql([UniswapV3Pool.address, UniswapV3Pool2.address]);
      });

      then('event is emmitted', async () => {
        await expect(tx).to.emit(UniswapV3Oracle, 'AddedSupportForPair').withArgs(TOKEN_A, TOKEN_B);
      });

      then(`pool's cardinality is increased correctly`, async () => {
        expect(await UniswapV3Pool2.cardinalitySent()).to.equal((5 * 60) / 15 + 10);
      });
    });
  });

  describe('addSupportForPairIfNeeded', () => {
    when(`pair's addreses are inverted`, () => {
      given(async () => {
        await supportFieTier(FEE);
        await UniswapV3Factory.setPool(TOKEN_A, TOKEN_B, FEE, UniswapV3Pool.address);
        await UniswapV3Oracle.addSupportForPairIfNeeded(TOKEN_B, TOKEN_A);
      });

      then(`correct order is sent to internal add support`, async () => {
        expect(await UniswapV3Oracle.addSupportForPairCalled(TOKEN_A, TOKEN_B)).to.be.true;
      });
    });

    when('pair does not have supported pools yet', () => {
      given(async () => {
        await supportFieTier(FEE);
        await UniswapV3Factory.setPool(TOKEN_A, TOKEN_B, FEE, UniswapV3Pool.address);
        await UniswapV3Oracle.addSupportForPairIfNeeded(TOKEN_A, TOKEN_B);
      });
      then('internal add support is called', async () => {
        expect(await UniswapV3Oracle.addSupportForPairCalled(TOKEN_A, TOKEN_B)).to.be.true;
      });
    });

    when('pair already has supported pools', () => {
      given(async () => {
        await supportFieTier(FEE);
        await UniswapV3Factory.setPool(TOKEN_A, TOKEN_B, FEE, UniswapV3Pool.address);
        await UniswapV3Oracle.internalAddSupportForPair(TOKEN_A, TOKEN_B);
        await UniswapV3Oracle.reset(TOKEN_A, TOKEN_B);

        await UniswapV3Oracle.addSupportForPairIfNeeded(TOKEN_A, TOKEN_B);
      });

      then('internal add support is not called', async () => {
        expect(await UniswapV3Oracle.addSupportForPairCalled(TOKEN_A, TOKEN_B)).to.be.false;
      });
    });
  });

  describe('internalAddSupportForPair', () => {
    when('there are no fee tiers supported', () => {
      then('tx is reverted with reason', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: UniswapV3Oracle,
          func: 'internalAddSupportForPair',
          args: [TOKEN_A, TOKEN_B],
          message: 'PairNotSupported',
        });
      });
    });
    when('there are no pools for the pair', () => {
      given(async () => {
        await supportFieTier(FEE);
      });

      then('tx is reverted with reason', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: UniswapV3Oracle,
          func: 'internalAddSupportForPair',
          args: [TOKEN_A, TOKEN_B],
          message: 'PairNotSupported',
        });
      });
    });
    when('only pool for the pair does not have liquidity', () => {
      given(async () => {
        await supportFieTier(FEE);
        await UniswapV3Factory.setPool(TOKEN_A, TOKEN_B, FEE, UniswapV3Pool.address);
        await UniswapV3Pool.setLiquidity(0);
      });
      then('tx is reverted with reason', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: UniswapV3Oracle,
          func: 'internalAddSupportForPair',
          args: [TOKEN_A, TOKEN_B],
          message: 'PairNotSupported',
        });
      });
    });
    when('there is a pool for the pair', () => {
      let tx: TransactionResponse;

      given(async () => {
        await supportFieTier(FEE);
        await UniswapV3Factory.setPool(TOKEN_A, TOKEN_B, FEE, UniswapV3Pool.address);
        tx = await UniswapV3Oracle.internalAddSupportForPair(TOKEN_A, TOKEN_B);
      });

      then(`it is added to list of pair's list of pools`, async () => {
        expect(await UniswapV3Oracle.poolsUsedForPair(TOKEN_A, TOKEN_B)).to.eql([UniswapV3Pool.address]);
      });

      then('event is emmitted', async () => {
        await expect(tx).to.emit(UniswapV3Oracle, 'AddedSupportForPair').withArgs(TOKEN_A, TOKEN_B);
      });

      then(`pool's cardinality is increased correctly`, async () => {
        expect(await UniswapV3Pool.cardinalitySent()).to.equal((5 * 60) / 15 + 10);
      });
    });
  });
  describe('poolsUsedForPair', () => {
    const TOKEN_A = '0x0000000000000000000000000000000000000001';
    const TOKEN_B = '0x0000000000000000000000000000000000000002';

    when('there are no pools registered', () => {
      then('an empty list is returned', async () => {
        expect(await UniswapV3Oracle.poolsUsedForPair(TOKEN_A, TOKEN_B)).to.be.empty;
      });
    });
    when('there is a pool for the pair', () => {
      const FEE = 1000;
      let UniswapV3Pool: Contract;

      given(async () => {
        UniswapV3Pool = await UniswapV3PoolContract.deploy();
        await supportFieTier(FEE);
        await UniswapV3Factory.setPool(TOKEN_A, TOKEN_B, FEE, UniswapV3Pool.address);
        await UniswapV3Oracle.addSupportForPairIfNeeded(TOKEN_A, TOKEN_B);
      });
      then('it is marked as used', async () => {
        expect(await UniswapV3Oracle.poolsUsedForPair(TOKEN_A, TOKEN_B)).to.eql([UniswapV3Pool.address]);
      });
      then('it is marked as used even when token addresses are reverted', async () => {
        expect(await UniswapV3Oracle.poolsUsedForPair(TOKEN_B, TOKEN_A)).to.eql([UniswapV3Pool.address]);
      });
    });
  });
  async function supportFieTier(fee: number) {
    await UniswapV3Factory.setTickSpacing(1);
    return UniswapV3Oracle.addFeeTier(fee);
  }
});
