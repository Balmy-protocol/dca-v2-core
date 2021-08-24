import chai, { expect } from 'chai';
import { Contract, Wallet, utils } from 'ethers';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { ethers } from 'hardhat';
import {
  DCAFactoryMock,
  DCAFactoryMock__factory,
  DCAKeep3rJobMock,
  DCAKeep3rJobMock__factory,
  DCAPairMock__factory,
  DCASwapperMock,
  DCASwapperMock__factory,
  IKeep3rV1,
} from '@typechained';
import { behaviours, constants, wallet } from '@test-utils';
import { given, then, when } from '@test-utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { FakeContract, smock } from '@defi-wonderland/smock';
import { abi as KEEP3R_ABI } from '@artifacts/contracts/interfaces/IKeep3rV1.sol/IKeep3rV1.json';
import moment from 'moment';

chai.use(smock.matchers);

describe('DCAKeep3rJob', () => {
  const ADDRESS_1 = '0x0000000000000000000000000000000000000001';
  const ADDRESS_2 = '0x0000000000000000000000000000000000000002';
  const BYTES_1 = ethers.utils.randomBytes(5);
  const BYTES_2 = ethers.utils.randomBytes(5);

  let owner: SignerWithAddress;
  let DCAKeep3rJobContract: DCAKeep3rJobMock__factory, DCAFactoryContract: DCAFactoryMock__factory;
  let DCASwapperContract: DCASwapperMock__factory, DCAPairContract: DCAPairMock__factory;
  let DCAKeep3rJob: DCAKeep3rJobMock, DCAFactory: FakeContract<DCAFactoryMock>;
  let DCASwapper: DCASwapperMock;
  let keep3r: FakeContract<IKeep3rV1>;

  before('Setup accounts and contracts', async () => {
    [owner] = await ethers.getSigners();
    DCAKeep3rJobContract = await ethers.getContractFactory('contracts/mocks/DCAKeep3rJob/DCAKeep3rJob.sol:DCAKeep3rJobMock');
    DCASwapperContract = await ethers.getContractFactory('contracts/mocks/DCAKeep3rJob/DCASwapperMock.sol:DCASwapperMock');
    DCAFactoryContract = await ethers.getContractFactory('contracts/mocks/DCAFactory/DCAFactory.sol:DCAFactoryMock');
    DCAPairContract = await ethers.getContractFactory('contracts/mocks/DCAKeep3rJob/DCAPairMock.sol:DCAPairMock');
    keep3r = await smock.fake(KEEP3R_ABI);
  });

  beforeEach('Deploy and configure', async () => {
    DCAFactory = await smock.fake(DCAFactoryContract);
    DCASwapper = await DCASwapperContract.deploy();
    DCAKeep3rJob = await DCAKeep3rJobContract.deploy(owner.address, DCAFactory.address, keep3r.address, DCASwapper.address);
    keep3r.worked.reset();
    keep3r.isKeeper.reset();
  });

  describe('constructor', () => {
    when('factory is zero address', () => {
      then('tx is reverted with reason error', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: DCAKeep3rJobContract,
          args: [owner.address, constants.ZERO_ADDRESS, keep3r.address, DCASwapper.address],
          message: 'ZeroAddress',
        });
      });
    });
    when('keep3r is zero address', () => {
      then('tx is reverted with reason error', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: DCAKeep3rJobContract,
          args: [owner.address, DCAFactory.address, constants.ZERO_ADDRESS, DCASwapper.address],
          message: 'ZeroAddress',
        });
      });
    });
    when('swapper is zero address', () => {
      then('tx is reverted with reason error', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: DCAKeep3rJobContract,
          args: [owner.address, DCAFactory.address, keep3r.address, constants.ZERO_ADDRESS],
          message: 'ZeroAddress',
        });
      });
    });
    when('all arguments are valid', () => {
      then('factory is set correctly', async () => {
        const factory = await DCAKeep3rJob.factory();
        expect(factory).to.equal(DCAFactory.address);
      });
      then('swapper is set correctly', async () => {
        const swapper = await DCAKeep3rJob.swapper();
        expect(swapper).to.equal(DCASwapper.address);
      });
    });
  });

  describe('setKeep3rV1', () => {
    when('keep3r address is zero', () => {
      then('tx is reverted with reason error', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAKeep3rJob,
          func: 'setKeep3rV1',
          args: [constants.ZERO_ADDRESS],
          message: 'ZeroAddress',
        });
      });
    });
    when('keep3r is not zero address', () => {
      let keep3rSetTx: TransactionResponse;
      const newKeep3r = wallet.generateRandomAddress();
      given(async () => {
        keep3rSetTx = await DCAKeep3rJob.setKeep3rV1(newKeep3r);
      });
      then('keep3r is set', async () => {
        expect(await DCAKeep3rJob.keep3rV1()).to.be.equal(newKeep3r);
      });
      then('event is emitted', async () => {
        expect(keep3rSetTx).to.emit(DCAKeep3rJob, 'Keep3rSet').withArgs(newKeep3r);
      });
    });
    behaviours.shouldBeExecutableOnlyByGovernor({
      contract: () => DCAKeep3rJob,
      funcAndSignature: 'setKeep3rV1(address)',
      params: [ADDRESS_1],
      governor: () => owner,
    });
  });

  describe('setSwapper', () => {
    when('swapper address is zero', () => {
      then('tx is reverted with reason error', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAKeep3rJob,
          func: 'setSwapper',
          args: [constants.ZERO_ADDRESS],
          message: 'ZeroAddress',
        });
      });
    });
    when('swapper is not zero address', () => {
      let swapperSetTx: TransactionResponse;
      const newSwapper = wallet.generateRandomAddress();
      given(async () => {
        swapperSetTx = await DCAKeep3rJob.setSwapper(newSwapper);
      });
      then('swapper is set', async () => {
        expect(await DCAKeep3rJob.swapper()).to.be.equal(newSwapper);
      });
      then('event is emitted', async () => {
        expect(swapperSetTx).to.emit(DCAKeep3rJob, 'SwapperSet').withArgs(newSwapper);
      });
    });
    behaviours.shouldBeExecutableOnlyByGovernor({
      contract: () => DCAKeep3rJob,
      funcAndSignature: 'setSwapper(address)',
      params: [ADDRESS_1],
      governor: () => owner,
    });
  });

  describe('startSubsidizingPairs', () => {
    when('one of the pairs is not a DCA pair', () => {
      given(async () => {
        DCAFactory.isPair.returnsAtCall(0, true);
        DCAFactory.isPair.returnsAtCall(1, false);
      });
      then('tx is reverted with reason', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAKeep3rJob,
          func: 'startSubsidizingPairs',
          args: [[ADDRESS_1, ADDRESS_2]],
          message: 'InvalidPairAddress',
        });
        await behaviours.txShouldRevertWithMessage({
          contract: DCAKeep3rJob,
          func: 'startSubsidizingPairs',
          args: [[ADDRESS_2, ADDRESS_1]],
          message: 'InvalidPairAddress',
        });
      });
    });
    when('addresses are valid pairs', () => {
      let tx: TransactionResponse;

      given(async () => {
        DCAFactory.isPair.returns(true);
        tx = await DCAKeep3rJob.startSubsidizingPairs([ADDRESS_1, ADDRESS_2]);
      });

      then('pairs are added', async () => {
        expect(await DCAKeep3rJob.subsidizedPairs()).to.eql([ADDRESS_1, ADDRESS_2]);
      });

      then('event is emmitted', async () => {
        await expect(tx).to.emit(DCAKeep3rJob, 'SubsidizingNewPairs').withArgs([ADDRESS_1, ADDRESS_2]);
      });
    });
    behaviours.shouldBeExecutableOnlyByGovernor({
      contract: () => DCAKeep3rJob,
      funcAndSignature: 'startSubsidizingPairs(address[])',
      params: [[ADDRESS_1]],
      governor: () => owner,
    });
  });
  describe('stopSubsidizingPairs', () => {
    given(async () => {
      DCAFactory.isPair.returns(true);
      await DCAKeep3rJob.startSubsidizingPairs([ADDRESS_1]);
    });
    when('address being subsidized is removed', () => {
      let tx: TransactionResponse;

      given(async () => {
        tx = await DCAKeep3rJob.stopSubsidizingPairs([ADDRESS_1]);
      });

      then('event is emitted', async () => {
        await expect(tx).to.emit(DCAKeep3rJob, 'StoppedSubsidizingPairs').withArgs([ADDRESS_1]);
      });
      then('pair is no longer subsidized', async () => {
        expect(await DCAKeep3rJob.subsidizedPairs()).to.be.empty;
      });
    });
    behaviours.shouldBeExecutableOnlyByGovernor({
      contract: () => DCAKeep3rJob,
      funcAndSignature: 'stopSubsidizingPairs(address[])',
      params: [[ADDRESS_1]],
      governor: () => owner,
    });
  });

  describe('setDelay', () => {
    const SWAP_INTERVAL = 10;
    when('delay is set', () => {
      let tx: TransactionResponse;

      given(async () => {
        tx = await DCAKeep3rJob.setDelay(SWAP_INTERVAL, 50);
      });

      then('event is emitted', async () => {
        await expect(tx).to.emit(DCAKeep3rJob, 'DelaySet').withArgs(SWAP_INTERVAL, 50);
      });
      then('the contract reports it so', async () => {
        expect(await DCAKeep3rJob.delay(SWAP_INTERVAL)).to.equal(50);
      });
    });
    behaviours.shouldBeExecutableOnlyByGovernor({
      contract: () => DCAKeep3rJob,
      funcAndSignature: 'setDelay',
      params: [SWAP_INTERVAL, 50],
      governor: () => owner,
    });
  });

  describe('delay', () => {
    const SWAP_INTERVAL = 10;
    when('delay is set', () => {
      given(async () => {
        await DCAKeep3rJob.setDelay(SWAP_INTERVAL, 50);
      });

      then('the set value is reported correctly', async () => {
        expect(await DCAKeep3rJob.delay(SWAP_INTERVAL)).to.equal(50);
      });
    });
    when('no delay is set', () => {
      then('the returned value is half of the interval', async () => {
        expect(await DCAKeep3rJob.delay(SWAP_INTERVAL)).to.equal(SWAP_INTERVAL / 2);
      });
    });
  });

  describe('workable', () => {
    let DCAPair1: Contract, DCAPair2: Contract, DCAPair3: Contract;

    given(async () => {
      DCAPair1 = await DCAPairContract.deploy();
      DCAPair2 = await DCAPairContract.deploy();
      DCAPair3 = await DCAPairContract.deploy();
      DCAFactory.isPair.returns(true);
    });

    when('there are no pairs being subsidized', () => {
      then('empty list is returned', async () => {
        const [pairsToSwap, intervals] = await DCAKeep3rJob.callStatic.workable();
        expect(pairsToSwap).to.be.empty;
        expect(intervals).to.be.empty;
      });
    });

    when('pairs being subsidized should not be swaped', () => {
      given(async () => {
        await DCAKeep3rJob.startSubsidizingPairs([DCAPair1.address, DCAPair2.address]);
        await DCASwapper.setPairsToSwap([], []);
      });

      then('empty list is returned', async () => {
        const [pairsToSwap, intervals] = await DCAKeep3rJob.callStatic.workable();
        expect(pairsToSwap).to.be.empty;
        expect(intervals).to.be.empty;
      });
    });

    when('pairs being subsidized could be swapped but delay has not passed', () => {
      const SWAP_INTERVAL = 60;
      const TIMESTAMP = moment().unix();

      given(async () => {
        await DCAPair1.setNextSwapAvailable(SWAP_INTERVAL, TIMESTAMP);
        await DCAPair1.setNextSwapInfo([SWAP_INTERVAL, SWAP_INTERVAL * 2]);
        await DCASwapper.setPairsToSwap([DCAPair1.address], [BYTES_1]);
        await DCAKeep3rJob.setBlockTimestamp(TIMESTAMP);
        await DCAKeep3rJob.setDelay(SWAP_INTERVAL, 1);
        await DCAKeep3rJob.startSubsidizingPairs([DCAPair1.address]);
      });

      then('empty list is returned', async () => {
        const [pairsToSwap, intervals] = await DCAKeep3rJob.callStatic.workable();
        expect(pairsToSwap).to.be.empty;
        expect(intervals).to.be.empty;
      });
    });

    when('some of the pairs being subsidized should be swapped', () => {
      const [SWAP_INTERVAL, SWAP_INTERVAL_2] = [60, 120];
      given(async () => {
        await DCAPair1.setNextSwapInfo([SWAP_INTERVAL, SWAP_INTERVAL_2]);
        await DCAPair3.setNextSwapInfo([SWAP_INTERVAL_2]);
        await DCAKeep3rJob.startSubsidizingPairs([DCAPair1.address, DCAPair2.address, DCAPair3.address]);
        await DCASwapper.setPairsToSwap([DCAPair1.address, DCAPair3.address], [BYTES_1, BYTES_2]);
      });

      then('then they are returned', async () => {
        const [pairsToSwap, smallestIntervals]: [{ pair: string; swapPath: string }[], number[]] = await DCAKeep3rJob.callStatic.workable();
        expect(pairsToSwap.map(({ pair }) => pair)).to.eql([DCAPair3.address, DCAPair1.address]);
        expect(pairsToSwap.map(({ swapPath }) => swapPath)).to.eql([utils.hexlify(BYTES_2), utils.hexlify(BYTES_1)]);
        expect(smallestIntervals).to.eql([SWAP_INTERVAL_2, SWAP_INTERVAL]);
      });
    });
  });

  describe('work', () => {
    const SWAP_INTERVAL = 60;
    let DCAPair1: Contract, DCAPair2: Contract;

    given(async () => {
      DCAPair1 = await DCAPairContract.deploy();
      DCAPair2 = await DCAPairContract.deploy();
      await keep3r.isKeeper.returns(true);
    });
    when('not being called from a keeper', () => {
      given(async () => {
        await keep3r.isKeeper.returns(false);
      });
      then('tx is reverted with reason error', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAKeep3rJob,
          func: 'work',
          args: [[[wallet.generateRandomAddress(), 1]], [SWAP_INTERVAL]],
          message: 'NotAKeeper',
        });
      });
    });
    when('pair is not being subsidized', () => {
      then('calling work will revert', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAKeep3rJob,
          func: 'work',
          args: [[[DCAPair1.address, 500]], [SWAP_INTERVAL]],
          message: 'PairNotSubsidized',
        });
      });
    });
    when('pair is being subsidized', () => {
      let keeper: Wallet;
      given(async () => {
        keeper = await wallet.generateRandom();
        DCAFactory.isPair.returns(true);
        await DCAKeep3rJob.startSubsidizingPairs([DCAPair1.address, DCAPair2.address]);
      });

      context('but no pair was swapped', () => {
        then('tx is reverted with reason error', async () => {
          await behaviours.txShouldRevertWithMessage({
            contract: DCAKeep3rJob,
            func: 'work',
            args: [
              [
                [DCAPair1.address, BYTES_1],
                [DCAPair2.address, BYTES_2],
              ],
              [SWAP_INTERVAL, SWAP_INTERVAL],
            ],
            message: 'NotWorked',
          });
        });
      });

      context('but delay has not passed', () => {
        const TIMESTAMP = moment().unix();
        given(async () => {
          await DCAPair1.setNextSwapAvailable(SWAP_INTERVAL, TIMESTAMP);
          await DCAKeep3rJob.setBlockTimestamp(TIMESTAMP);
          await DCAKeep3rJob.setDelay(SWAP_INTERVAL, 1);
        });

        then('tx is reverted with reason error', async () => {
          await behaviours.txShouldRevertWithMessage({
            contract: DCAKeep3rJob,
            func: 'work',
            args: [[[DCAPair1.address, BYTES_1]], [SWAP_INTERVAL]],
            message: 'MustWaitDelay',
          });
        });
      });

      context('and pair were swapped', () => {
        given(async () => {
          await DCASwapper.setAmountSwapped(2);
          await DCAKeep3rJob.connect(keeper).work(
            [
              { pair: DCAPair1.address, swapPath: BYTES_1 },
              { pair: DCAPair2.address, swapPath: BYTES_2 },
            ],
            [SWAP_INTERVAL, SWAP_INTERVAL],
            { gasPrice: 0 }
          );
        });
        then('job will call the swapper', async () => {
          const lastCalled = await DCASwapper.lastCalled();
          expect(lastCalled).to.eql([
            [DCAPair1.address, utils.hexlify(BYTES_1)],
            [DCAPair2.address, utils.hexlify(BYTES_2)],
          ]);
        });

        then('keep3r protocol gets consulted if worker is a keeper', () => {
          expect(keep3r.isKeeper).to.have.been.calledOnce;
          expect(keep3r.isKeeper).to.have.been.calledWith(keeper.address);
        });

        then('keep3r protocol gets notice of the work done by keeper', async () => {
          expect(keep3r.worked).to.have.been.calledOnce;
          expect(keep3r.worked).to.have.been.calledWith(keeper.address);
        });
      });
    });
  });
});
