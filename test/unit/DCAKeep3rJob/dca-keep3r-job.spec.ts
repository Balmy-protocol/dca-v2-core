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
  let DCAKeep3rJob: Contract, DCAFactory: Contract;

  before('Setup accounts and contracts', async () => {
    [owner, swapperCaller] = await ethers.getSigners();
    DCAKeep3rJobContract = await ethers.getContractFactory('contracts/mocks/DCAKeep3rJob/DCAKeep3rJob.sol:DCAKeep3rJobMock');
    DCAFactoryContract = await ethers.getContractFactory('contracts/mocks/DCAKeep3rJob/DCAFactoryMock.sol:DCAFactoryMock');
  });

  beforeEach('Deploy and configure', async () => {
    DCAFactory = await DCAFactoryContract.deploy();
    DCAKeep3rJob = await DCAKeep3rJobContract.deploy(owner.address, DCAFactory.address);
  });

  describe('constructor', () => {
    when('factory is zero address', () => {
      then('tx is reverted with reason error', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: DCAKeep3rJobContract,
          args: [owner.address, constants.ZERO_ADDRESS],
          message: 'ZeroAddress',
        });
      });
    });
    when('all arguments are valid', () => {
      then('factory is set correctly', async () => {
        const factory = await DCAKeep3rJob.factory();
        expect(factory).to.equal(DCAFactory.address);
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
});
