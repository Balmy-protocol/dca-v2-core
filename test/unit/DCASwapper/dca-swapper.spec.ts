import { expect } from 'chai';
import { Contract, ContractFactory } from 'ethers';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { ethers } from 'hardhat';
import { behaviours } from '../../utils';
import { given, then, when } from '../../utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';

describe('DCASwapper', () => {
  const ADDRESS_1 = '0x0000000000000000000000000000000000000001';
  const ADDRESS_2 = '0x0000000000000000000000000000000000000002';

  let owner: SignerWithAddress;
  let DCASwapperContract: ContractFactory;
  let DCAFactoryContract: ContractFactory;
  let DCASwapper: Contract;
  let DCAFactory: Contract;

  before('Setup accounts and contracts', async () => {
    [owner] = await ethers.getSigners();
    DCASwapperContract = await ethers.getContractFactory('contracts/mocks/DCASwapper/DCASwapper.sol:DCASwapperMock');
    DCAFactoryContract = await ethers.getContractFactory('contracts/mocks/DCASwapper/DCAFactoryMock.sol:DCAFactoryMock');
  });

  beforeEach('Deploy and configure', async () => {
    DCAFactory = await DCAFactoryContract.deploy();
    DCASwapper = await DCASwapperContract.deploy(owner.address, DCAFactory.address);
  });

  describe('startWatchingPairs', () => {
    when('one of the pairs is not a DCA pair', () => {
      given(async () => {
        await DCAFactory.setAsPair(ADDRESS_1);
      });
      then('tx is reverted with reason', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCASwapper,
          func: 'startWatchingPairs',
          args: [[ADDRESS_1, ADDRESS_2]],
          message: 'InvalidPairAddress',
        });
        await behaviours.txShouldRevertWithMessage({
          contract: DCASwapper,
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
        tx = await DCASwapper.startWatchingPairs([ADDRESS_1, ADDRESS_2]);
      });

      then('pairs are added', async () => {
        expect(await DCASwapper.watchedPairs()).to.eql([ADDRESS_1, ADDRESS_2]);
      });

      then('event is emmitted', async () => {
        await expect(tx).to.emit(DCASwapper, 'WatchingNewPairs').withArgs([ADDRESS_1, ADDRESS_2]);
      });
    });
    behaviours.shouldBeExecutableOnlyByGovernor({
      contract: () => DCASwapper,
      funcAndSignature: 'startWatchingPairs(address[])',
      params: [[ADDRESS_1]],
      governor: () => owner,
    });
  });
  describe('stopWatchingPairs', () => {
    given(async () => {
      await DCAFactory.setAsPair(ADDRESS_1);
      await DCASwapper.startWatchingPairs([ADDRESS_1]);
    });
    when('address being watch is removed', () => {
      let tx: TransactionResponse;

      given(async () => {
        tx = await DCASwapper.stopWatchingPairs([ADDRESS_1]);
      });

      then('event is emitted', async () => {
        await expect(tx).to.emit(DCASwapper, 'StoppedWatchingPairs').withArgs([ADDRESS_1]);
      });
      then('pair is no longer watched', async () => {
        expect(await DCASwapper.watchedPairs()).to.be.empty;
      });
    });
    behaviours.shouldBeExecutableOnlyByGovernor({
      contract: () => DCASwapper,
      funcAndSignature: 'stopWatchingPairs(address[])',
      params: [[ADDRESS_1]],
      governor: () => owner,
    });
  });
});
