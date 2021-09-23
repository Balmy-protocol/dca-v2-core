import { ethers } from 'hardhat';
import { DCATokenDescriptor } from '@typechained';
import { behaviours } from '@test-utils';
import { contract, then, when } from '@test-utils/bdd';
import { snapshot } from '@test-utils/evm';
import { expect } from 'chai';
import { SUPPORTED_SWAP_INTERVALS } from '../DCAHub/dca-hub-parameters.spec';

contract('DCATokenDescriptor', () => {
  const SWAP_INTERVALS_DESCRIPTIONS = [
    'Every 5 minutes',
    'Every 15 minutes',
    'Every 30 minutes',
    'Hourly',
    'Every 12 hours',
    'Daily',
    'Weekly',
    'Monthy',
  ];
  let DCATokenDescriptor: DCATokenDescriptor;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    const DCATokenDescriptorFactory = await ethers.getContractFactory('contracts/DCATokenDescriptor/DCATokenDescriptor.sol:DCATokenDescriptor');
    DCATokenDescriptor = await DCATokenDescriptorFactory.deploy();
    snapshotId = await snapshot.take();
  });

  beforeEach('Deploy and configure', async () => {
    await snapshot.revert(snapshotId);
  });

  describe('intervalToDescription', () => {
    when('calling intervalToDescription with an invalid interval', () => {
      then('reverts with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCATokenDescriptor,
          func: 'intervalToDescription',
          args: [0],
          message: 'InvalidInterval',
        });
      });
    });

    when('calling intervalToDescription with a valid interval', () => {
      then('result is returned correctly', async () => {
        for (let i = 0; i < SUPPORTED_SWAP_INTERVALS.length; i++) {
          const interval = SUPPORTED_SWAP_INTERVALS[i];
          expect(await DCATokenDescriptor.intervalToDescription(interval)).to.equal(SWAP_INTERVALS_DESCRIPTIONS[i]);
        }
      });
    });
  });
});
