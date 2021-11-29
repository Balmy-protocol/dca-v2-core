import { expect } from 'chai';
import { ethers } from 'hardhat';
import { behaviours, constants } from '@test-utils';
import { given, then, when } from '@test-utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { OracleAggregatorMock, OracleAggregatorMock__factory, IPriceOracle } from '@typechained';
import { snapshot } from '@test-utils/evm';
import { FakeContract, smock } from '@defi-wonderland/smock';
import { BigNumber } from '@ethersproject/bignumber';
import { TransactionResponse } from '@ethersproject/abstract-provider';

describe('OracleAggregator', () => {
  const TOKEN_A = '0x0000000000000000000000000000000000000001';
  const TOKEN_B = '0x0000000000000000000000000000000000000002';
  let governor: SignerWithAddress;
  let oracleAggregatorFactory: OracleAggregatorMock__factory;
  let oracleAggregator: OracleAggregatorMock;
  let snapshotId: string;
  let oracle1: FakeContract<IPriceOracle>, oracle2: FakeContract<IPriceOracle>;

  before('Setup accounts and contracts', async () => {
    [governor] = await ethers.getSigners();
    oracleAggregatorFactory = await ethers.getContractFactory('contracts/mocks/oracles/OracleAggregator.sol:OracleAggregatorMock');
    snapshotId = await snapshot.take();
  });

  beforeEach('Deploy and configure', async () => {
    await snapshot.revert(snapshotId);
    oracle1 = await smock.fake('IPriceOracle');
    oracle2 = await smock.fake('IPriceOracle');
    oracleAggregator = await oracleAggregatorFactory.deploy(oracle1.address, oracle2.address, governor.address);
  });

  describe('constructor', () => {
    when('oracle1 is zero address', () => {
      then('tx is reverted with reason error', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: oracleAggregatorFactory,
          args: [constants.ZERO_ADDRESS, oracle2.address, governor.address],
          message: 'ZeroAddress',
        });
      });
    });
    when('oracle2 is zero address', () => {
      then('tx is reverted with reason error', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: oracleAggregatorFactory,
          args: [oracle1.address, constants.ZERO_ADDRESS, governor.address],
          message: 'ZeroAddress',
        });
      });
    });
    when('all arguments are valid', () => {
      then('oracle 1 is set correctly', async () => {
        const oracle = await oracleAggregator.oracle1();
        expect(oracle).to.equal(oracle1.address);
      });
      then('oracle 2 is set correctly', async () => {
        const oracle = await oracleAggregator.oracle2();
        expect(oracle).to.equal(oracle2.address);
      });
    });
  });

  describe('setOracleForPair', () => {
    when('trying to set an invalid oracle for use', () => {
      then('tx is reverted with reason', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: oracleAggregator,
          func: 'setOracleForPair',
          args: [TOKEN_A, TOKEN_B, 0],
          message: 'InvalidOracle',
        });
      });
    });
    when('setting oracle 1 for use', () => {
      let tx: TransactionResponse;
      given(async () => {
        tx = await oracleAggregator.setOracleForPair(TOKEN_A, TOKEN_B, 1);
      });
      then('oracle 1 is called', async () => {
        expect(oracle1.addSupportForPairIfNeeded).to.be.calledWith(TOKEN_A, TOKEN_B);
      });
      then('now oracle 1 will be used', async () => {
        expect(await oracleAggregator.oracleInUse(TOKEN_A, TOKEN_B)).to.equal(1);
      });
      then('event is emitted', async () => {
        await expect(tx).to.emit(oracleAggregator, 'OracleSetForUse').withArgs(TOKEN_A, TOKEN_B, 1);
      });
    });
    when('setting oracle 2 for use', () => {
      let tx: TransactionResponse;
      given(async () => {
        tx = await oracleAggregator.setOracleForPair(TOKEN_A, TOKEN_B, 2);
      });
      then('oracle 2 is called', async () => {
        expect(oracle2.addSupportForPairIfNeeded).to.be.calledWith(TOKEN_A, TOKEN_B);
      });
      then('now oracle 2 will be used', async () => {
        expect(await oracleAggregator.oracleInUse(TOKEN_A, TOKEN_B)).to.equal(2);
      });
      then('event is emitted', async () => {
        await expect(tx).to.emit(oracleAggregator, 'OracleSetForUse').withArgs(TOKEN_A, TOKEN_B, 2);
      });
    });
    behaviours.shouldBeExecutableOnlyByGovernor({
      contract: () => oracleAggregator,
      funcAndSignature: 'setOracleForPair',
      params: [TOKEN_A, TOKEN_B, 2],
      governor: () => governor,
    });
  });

  describe('canSupportPair', () => {
    when('neither oracle supports a pair', () => {
      given(() => {
        oracle1.canSupportPair.returns(false);
        oracle2.canSupportPair.returns(false);
      });
      then('pair is not supported', async () => {
        expect(await oracleAggregator.canSupportPair(TOKEN_A, TOKEN_B)).to.be.false;
      });
    });
    when('oracle1 supports a pair but oracle 2 does not', () => {
      given(() => {
        oracle1.canSupportPair.returns(true);
        oracle2.canSupportPair.returns(false);
      });
      then('pair is supported', async () => {
        expect(await oracleAggregator.canSupportPair(TOKEN_A, TOKEN_B)).to.be.true;
      });
    });
    when('oracle2 supports a pair but oracle 1 does not', () => {
      given(() => {
        oracle1.canSupportPair.returns(false);
        oracle2.canSupportPair.returns(true);
      });
      then('pair is supported', async () => {
        expect(await oracleAggregator.canSupportPair(TOKEN_A, TOKEN_B)).to.be.true;
      });
    });
    when('both oracle support a pair', () => {
      given(() => {
        oracle1.canSupportPair.returns(true);
        oracle2.canSupportPair.returns(true);
      });
      then('pair is supported', async () => {
        expect(await oracleAggregator.canSupportPair(TOKEN_A, TOKEN_B)).to.be.true;
      });
    });
  });

  describe('reconfigureSupportForPair', () => {
    when(`pair's addreses are inverted`, () => {
      given(async () => {
        await oracleAggregator.reconfigureSupportForPair(TOKEN_B, TOKEN_A);
      });
      then(`correct order is sent to internal add support`, async () => {
        expect(await oracleAggregator.addSupportForPairCalled(TOKEN_A, TOKEN_B)).to.be.true;
      });
    });
    when('addresses are sent sorted', () => {
      given(async () => {
        await oracleAggregator.reconfigureSupportForPair(TOKEN_A, TOKEN_B);
      });
      then(`same order is sent to internal add support`, async () => {
        expect(await oracleAggregator.addSupportForPairCalled(TOKEN_A, TOKEN_B)).to.be.true;
      });
    });
    behaviours.shouldBeExecutableOnlyByGovernor({
      contract: () => oracleAggregator,
      funcAndSignature: 'reconfigureSupportForPair(address,address)',
      params: [TOKEN_A, TOKEN_B],
      governor: () => governor,
    });
  });

  describe('addSupportForPairIfNeeded', () => {
    when(`pair's addreses are inverted`, () => {
      given(async () => {
        await oracleAggregator.addSupportForPairIfNeeded(TOKEN_B, TOKEN_A);
      });

      then(`correct order is sent to internal add support`, async () => {
        expect(await oracleAggregator.addSupportForPairCalled(TOKEN_A, TOKEN_B)).to.be.true;
      });
    });

    when('pair does not have an assigned oracle', () => {
      given(async () => {
        await oracleAggregator.addSupportForPairIfNeeded(TOKEN_A, TOKEN_B);
      });
      then('internal add support is called', async () => {
        expect(await oracleAggregator.addSupportForPairCalled(TOKEN_A, TOKEN_B)).to.be.true;
      });
    });

    when('pair already an assigned oracle', () => {
      given(async () => {
        await oracleAggregator.setOracleForPair(TOKEN_A, TOKEN_B, 1);
        await oracleAggregator.addSupportForPairIfNeeded(TOKEN_A, TOKEN_B);
      });
      then('internal add support is not called again', async () => {
        expect(await oracleAggregator.addSupportForPairCalled(TOKEN_A, TOKEN_B)).to.be.false;
      });
    });
  });

  describe('internalAddSupportForPair', () => {
    when('oracle 1 can support the given pair', () => {
      let tx: TransactionResponse;
      given(async () => {
        oracle1.canSupportPair.returns(true);
        tx = await oracleAggregator.internalAddSupportForPair(TOKEN_A, TOKEN_B);
      });
      then('oracle 1 is called', async () => {
        expect(oracle1.reconfigureSupportForPair).to.be.calledWith(TOKEN_A, TOKEN_B);
      });
      then('oracle 2 is not called', async () => {
        expect(oracle2.reconfigureSupportForPair).to.not.have.been.called;
      });
      then('now oracle 1 will be used', async () => {
        expect(await oracleAggregator.oracleInUse(TOKEN_A, TOKEN_B)).to.equal(1);
      });
      then('event is emitted', async () => {
        await expect(tx).to.emit(oracleAggregator, 'OracleSetForUse').withArgs(TOKEN_A, TOKEN_B, 1);
      });
    });
    when('oracle 1 cant support the given pair', () => {
      let tx: TransactionResponse;
      given(async () => {
        oracle1.canSupportPair.returns(false);
        tx = await oracleAggregator.internalAddSupportForPair(TOKEN_A, TOKEN_B);
      });
      then('oracle 2 is called', async () => {
        expect(oracle2.reconfigureSupportForPair).to.be.calledWith(TOKEN_A, TOKEN_B);
      });
      then('oracle 1 is not called', async () => {
        expect(oracle1.reconfigureSupportForPair).to.not.have.been.called;
      });
      then('now oracle 2 will be used', async () => {
        expect(await oracleAggregator.oracleInUse(TOKEN_A, TOKEN_B)).to.equal(2);
      });
      then('event is emitted', async () => {
        await expect(tx).to.emit(oracleAggregator, 'OracleSetForUse').withArgs(TOKEN_A, TOKEN_B, 2);
      });
    });
  });
  describe('quote', () => {
    when('no oracle is being used for the pair', () => {
      then('tx is reverted with reason', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: oracleAggregator,
          func: 'quote',
          args: [TOKEN_A, 1000, TOKEN_B],
          message: 'PairNotSupported',
        });
      });
    });
    when('oracle 1 is being used for pair', () => {
      const RESULT = BigNumber.from(5);
      let amountOut: BigNumber;
      given(async () => {
        await oracleAggregator.setOracleForPair(TOKEN_A, TOKEN_B, 1);
        oracle1.quote.returns(RESULT);
        amountOut = await oracleAggregator.quote(TOKEN_A, 1000, TOKEN_B);
      });
      then('oracle 1 was called', async () => {
        expect(oracle1.quote).to.have.been.calledWith(TOKEN_A, 1000, TOKEN_B);
      });
      then('oracle 2 was not called', () => {
        expect(oracle2.quote).to.not.have.been.called;
      });
      then('result is what oracle 1 returned', () => {
        expect(amountOut).to.equal(RESULT);
      });
    });
    when('oracle 2 is being used for pair', () => {
      const RESULT = BigNumber.from(15);
      let amountOut: BigNumber;
      given(async () => {
        await oracleAggregator.setOracleForPair(TOKEN_A, TOKEN_B, 2);
        oracle2.quote.returns(RESULT);
        amountOut = await oracleAggregator.quote(TOKEN_A, 3000, TOKEN_B);
      });
      then('oracle 2 was called', async () => {
        expect(oracle2.quote).to.have.been.calledWith(TOKEN_A, 3000, TOKEN_B);
      });
      then('oracle 1 was not called', () => {
        expect(oracle1.quote).to.not.have.been.called;
      });
      then('result is what oracle 2 returned', () => {
        expect(amountOut).to.equal(RESULT);
      });
    });
  });
});
