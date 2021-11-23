import { IntervalsMock, IntervalsMock__factory } from '@typechained';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { when, then } from '@test-utils/bdd';
import { SwapInterval } from 'js-lib/interval-utils';
import { behaviours } from '@test-utils';

describe('Intervals', () => {
  let intervals: IntervalsMock;

  before('Setup accounts and contracts', async () => {
    const intervalsFactory: IntervalsMock__factory = await ethers.getContractFactory('contracts/mocks/libraries/Intervals.sol:IntervalsMock');
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

  describe('intervalsInByte', () => {
    intervalsInByteTest({
      when: 'byte is zero',
      byte: '0x00',
      expected: [],
    });

    intervalsInByteTest({
      when: 'byte is full',
      byte: '0xFF',
      expected: SwapInterval.INTERVALS,
    });

    intervalsInByteTest({
      when: 'byte has only some intervals',
      byte: '0x83',
      expected: [SwapInterval.ONE_MINUTE, SwapInterval.FIVE_MINUTES, SwapInterval.ONE_WEEK],
    });

    function intervalsInByteTest({ when: title, byte, expected }: { when: string; byte: string; expected: SwapInterval[] }) {
      when(title, () => {
        then('intervals are returned as expected', async () => {
          const intervalsInByte = await intervals.intervalsInByte(byte);
          expect(intervalsInByte.length).to.equal(8);
          expect(intervalsInByte.slice(0, expected.length)).to.eql(expected.map((interval) => interval.seconds));
          expect(intervalsInByte.slice(expected.length)).to.eql(new Array(8 - expected.length).fill(0));
        });
      });
    }
  });
});
