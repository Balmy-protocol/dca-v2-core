import { ethers } from 'hardhat';
import { DCATokenDescriptor__factory, DCATokenDescriptor } from '@typechained';
import { behaviours } from '@test-utils';
import { contract, then, when } from '@test-utils/bdd';
import { snapshot } from '@test-utils/evm';
import { expect } from 'chai';
import { SwapInterval } from 'js-lib/interval-utils';

contract('DCATokenDescriptor', () => {
  const SWAP_INTERVALS_DESCRIPTIONS = [
    'Every minute',
    'Every 5 minutes',
    'Every 15 minutes',
    'Every 30 minutes',
    'Hourly',
    'Every 4 hours',
    'Daily',
    'Weekly',
  ];
  let DCATokenDescriptor: DCATokenDescriptor;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    const DCATokenDescriptorFactory: DCATokenDescriptor__factory = await ethers.getContractFactory(
      'contracts/DCATokenDescriptor/DCATokenDescriptor.sol:DCATokenDescriptor'
    );
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
        for (let i = 0; i < SwapInterval.INTERVALS.length; i++) {
          const interval = SwapInterval.INTERVALS[i];
          expect(await DCATokenDescriptor.intervalToDescription(interval.seconds)).to.equal(SWAP_INTERVALS_DESCRIPTIONS[i]);
        }
      });
    });
  });
});
