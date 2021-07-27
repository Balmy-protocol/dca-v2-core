import { expect } from 'chai';
import { Contract, ContractFactory } from 'ethers';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { ethers } from 'hardhat';
import { behaviours, constants } from '../../utils';
import { given, then, when } from '../../utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';

describe('DCAKeep3rJob', () => {
  const ADDRESS_1 = '0x0000000000000000000000000000000000000001';
  const ADDRESS_2 = '0x0000000000000000000000000000000000000002';

  let owner: SignerWithAddress, swapperCaller: SignerWithAddress;
  let DCAKeep3rJobContract: ContractFactory, DCAFactoryContract: ContractFactory;
  let DCASwapperContract: ContractFactory;
  let DCAKeep3rJob: Contract, DCAFactory: Contract;
  let DCASwapper: Contract;

  before('Setup accounts and contracts', async () => {
    [owner, swapperCaller] = await ethers.getSigners();
    DCAKeep3rJobContract = await ethers.getContractFactory('contracts/mocks/DCAKeep3rJob/DCAKeep3rJob.sol:DCAKeep3rJobMock');
    DCASwapperContract = await ethers.getContractFactory('contracts/mocks/DCAKeep3rJob/DCASwapperMock.sol:DCASwapperMock');
    DCAFactoryContract = await ethers.getContractFactory('contracts/mocks/DCAKeep3rJob/DCAFactoryMock.sol:DCAFactoryMock');
  });

  beforeEach('Deploy and configure', async () => {
    DCAFactory = await DCAFactoryContract.deploy();
    DCASwapper = await DCASwapperContract.deploy();
    DCAKeep3rJob = await DCAKeep3rJobContract.deploy(owner.address, DCAFactory.address, DCASwapper.address);
  });

  describe('constructor', () => {
    when('factory is zero address', () => {
      then('tx is reverted with reason error', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: DCAKeep3rJobContract,
          args: [owner.address, constants.ZERO_ADDRESS, DCASwapper.address],
          message: 'ZeroAddress',
        });
      });
    });
    when('swapper is zero address', () => {
      then('tx is reverted with reason error', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: DCAKeep3rJobContract,
          args: [owner.address, DCAFactory.address, constants.ZERO_ADDRESS],
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

  describe('startWatchingPairs', () => {
    when('one of the pairs is not a DCA pair', () => {
      given(async () => {
        await DCAFactory.setAsPair(ADDRESS_1);
      });
      then('tx is reverted with reason', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAKeep3rJob,
          func: 'startWatchingPairs',
          args: [[ADDRESS_1, ADDRESS_2]],
          message: 'InvalidPairAddress',
        });
        await behaviours.txShouldRevertWithMessage({
          contract: DCAKeep3rJob,
          func: 'startWatchingPairs',
          args: [[ADDRESS_2, ADDRESS_1]],
          message: 'InvalidPairAddress',
        });
      });
    });
    when('addresses are valid pairs', () => {
      let tx: TransactionResponse;

      given(async () => {
        await DCAFactory.setAsPair(ADDRESS_1);
        await DCAFactory.setAsPair(ADDRESS_2);
        tx = await DCAKeep3rJob.startWatchingPairs([ADDRESS_1, ADDRESS_2]);
      });

      then('pairs are added', async () => {
        expect(await DCAKeep3rJob.watchedPairs()).to.eql([ADDRESS_1, ADDRESS_2]);
      });

      then('event is emmitted', async () => {
        await expect(tx).to.emit(DCAKeep3rJob, 'WatchingNewPairs').withArgs([ADDRESS_1, ADDRESS_2]);
      });
    });
    behaviours.shouldBeExecutableOnlyByGovernor({
      contract: () => DCAKeep3rJob,
      funcAndSignature: 'startWatchingPairs(address[])',
      params: [[ADDRESS_1]],
      governor: () => owner,
    });
  });
  describe('stopWatchingPairs', () => {
    given(async () => {
      await DCAFactory.setAsPair(ADDRESS_1);
      await DCAKeep3rJob.startWatchingPairs([ADDRESS_1]);
    });
    when('address being watch is removed', () => {
      let tx: TransactionResponse;

      given(async () => {
        tx = await DCAKeep3rJob.stopWatchingPairs([ADDRESS_1]);
      });

      then('event is emitted', async () => {
        await expect(tx).to.emit(DCAKeep3rJob, 'StoppedWatchingPairs').withArgs([ADDRESS_1]);
      });
      then('pair is no longer watched', async () => {
        expect(await DCAKeep3rJob.watchedPairs()).to.be.empty;
      });
    });
    behaviours.shouldBeExecutableOnlyByGovernor({
      contract: () => DCAKeep3rJob,
      funcAndSignature: 'stopWatchingPairs(address[])',
      params: [[ADDRESS_1]],
      governor: () => owner,
    });
  });

  describe('getPairsToSwap', () => {
    const ADDRESS_3 = '0x0000000000000000000000000000000000000003';

    given(async () => {
      await DCAFactory.setAsPair(ADDRESS_1);
      await DCAFactory.setAsPair(ADDRESS_2);
      await DCAFactory.setAsPair(ADDRESS_3);
    });

    when('there are no pairs being watched', () => {
      then('empty list is returned', async () => {
        const pairsToSwap = await DCAKeep3rJob.callStatic.getPairsToSwap();
        expect(pairsToSwap).to.be.empty;
      });
    });

    when('pairs being watched should not be swaped', () => {
      given(async () => {
        await DCAKeep3rJob.startWatchingPairs([ADDRESS_1, ADDRESS_2]);
        await DCASwapper.setPairsToSwap([], []);
      });

      then('empty list is returned', async () => {
        const pairsToSwap = await DCAKeep3rJob.callStatic.getPairsToSwap();
        expect(pairsToSwap).to.be.empty;
      });
    });

    when('some of the pairs being watched should be swapped', () => {
      given(async () => {
        await DCAKeep3rJob.startWatchingPairs([ADDRESS_1, ADDRESS_2, ADDRESS_3]);
        await DCASwapper.setPairsToSwap([ADDRESS_1, ADDRESS_3], [3000, 10000]);
      });

      then('then they are returned', async () => {
        const pairsToSwap: { pair: string; bestFeeTier: number }[] = await DCAKeep3rJob.callStatic.getPairsToSwap();
        expect(pairsToSwap.map(({ pair }) => pair)).to.eql([ADDRESS_3, ADDRESS_1]);
        expect(pairsToSwap.map(({ bestFeeTier }) => bestFeeTier)).to.eql([10000, 3000]);
      });
    });
  });
});
