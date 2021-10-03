import { IntervalsMock, IntervalsMock__factory } from '@typechained';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { when, then } from '@test-utils/bdd';
import { SwapInterval } from 'js-lib/interval-utils';
import { behaviours } from '@test-utils';

describe('Intervals', () => {
  let intervalsFactory: IntervalsMock__factory;
  let intervals: IntervalsMock;

  before('Setup accounts and contracts', async () => {
    intervalsFactory = await ethers.getContractFactory('contracts/mocks/libraries/Intervals.sol:IntervalsMock');
  });

  beforeEach('Deploy and configure', async () => {
    intervals = await intervalsFactory.deploy();
  });

  describe('intervalToMask/maskToInterval', () => {
    when('calling intervalToMask with an invalid input', () => {
      then('reverts with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: intervals,
          func: 'intervalToMask',
          args: [0],
          message: 'InvalidInterval',
        });
      });
    });

    when('calling maskToInterval with an invalid input', () => {
      then('reverts with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: intervals,
          func: 'maskToInterval',
          args: [0],
          message: 'InvalidMask',
        });
      });
    });

    when('calling intervalToMask/maskToInterval with a valid input', () => {
      then('result is returned correctly', async () => {
        for (let i = 0; i < SwapInterval.INTERVALS.length; i++) {
          const interval = SwapInterval.INTERVALS[i];
          expect(await intervals.intervalToMask(interval.seconds)).to.equal(interval.mask);
          expect(await intervals.maskToInterval(interval.mask)).to.equal(interval.seconds);
        }
      });
    });
  });
});
