import { expect } from 'chai';
import { BigNumber, BigNumberish, Contract } from 'ethers';
import { ethers } from 'hardhat';
import {
  DCAHubSwapCalleeMock,
  DCAHubSwapCalleeMock__factory,
  DCAHubSwapHandlerMock,
  DCAHubSwapHandlerMock__factory,
  IPriceOracle,
} from '@typechained';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { constants, erc20, bn, behaviours } from '@test-utils';
import { contract, given, then, when } from '@test-utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { readArgFromEventOrFail } from '@test-utils/event-utils';
import { TokenContract } from '@test-utils/erc20';
import { snapshot } from '@test-utils/evm';
import { buildGetNextSwapInfoInput, buildSwapInput } from 'js-lib/swap-utils';
import { SwapInterval } from 'js-lib/interval-utils';
import { FakeContract, smock } from '@defi-wonderland/smock';

const CALCULATE_FEE = (bn: BigNumber) => bn.mul(6).div(1000);
const APPLY_FEE = (bn: BigNumber) => bn.mul(994).div(1000);

contract('DCAHubSwapHandler', () => {
  let owner: SignerWithAddress;
  let swapper: SignerWithAddress, rewardRecipient: SignerWithAddress;
  let tokenA: TokenContract, tokenB: TokenContract, tokenC: TokenContract;
  let DCAHubSwapHandlerContract: DCAHubSwapHandlerMock__factory;
  let DCAHubSwapHandler: DCAHubSwapHandlerMock;
  let priceOracle: FakeContract<IPriceOracle>;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    [owner, swapper, rewardRecipient] = await ethers.getSigners();
    DCAHubSwapHandlerContract = await ethers.getContractFactory('contracts/mocks/DCAHub/DCAHubSwapHandler.sol:DCAHubSwapHandlerMock');

    const deploy = (decimals: number) =>
      erc20.deploy({
        name: 'A name',
        symbol: 'SYMB',
        decimals: decimals,
        initialAccount: owner.address,
        initialAmount: ethers.constants.MaxUint256.div(2),
      });

    const tokens = await Promise.all([deploy(12), deploy(16), deploy(18)]);

    [tokenA, tokenB, tokenC] = tokens.sort((a, b) => a.address.localeCompare(b.address));

    priceOracle = await smock.fake('IPriceOracle');
    DCAHubSwapHandler = await DCAHubSwapHandlerContract.deploy(owner.address, owner.address, priceOracle.address);
    snapshotId = await snapshot.take();
  });

  beforeEach('Deploy and configure', async () => {
    await snapshot.revert(snapshotId);
  });

  describe('_registerSwap', () => {
    registerSwapTest({
      title: 'it is the first swap',
      tokenA: () => tokenA,
      tokenB: () => tokenB,
      nextSwapNumber: 1,
      ratioAToB: 123456789,
      ratioBToA: 9991230,
      blockTimestamp: 1000000,
      amountToSwapTokenA: 1000000,
      amountToSwapTokenB: 5000,
    });

    registerSwapTest({
      title: 'it is not the first swap',
      tokenA: () => tokenA,
      tokenB: () => tokenB,
      nextSwapNumber: 5,
      ratioAToB: 123456789,
      ratioBToA: 9991230,
      blockTimestamp: 1000000,
      amountToSwapTokenA: 1000000,
      amountToSwapTokenB: 5000,
      previous: {
        accumRatioAToB: 100004003,
        accumRatioBToA: 600312,
      },
    });

    when('no amount was swapped', () => {
      const NEXT_SWAP = 10;
      const LAST_SWAPPED_AT = 50;

      given(async () => {
        await DCAHubSwapHandler.addActiveSwapInterval(tokenA.address, tokenB.address, SwapInterval.ONE_DAY.mask);
        await DCAHubSwapHandler.setPerformedSwaps(tokenA.address, tokenB.address, SwapInterval.ONE_DAY.mask, NEXT_SWAP - 1);
        await DCAHubSwapHandler.setLastSwappedAt(tokenA.address, tokenB.address, SwapInterval.ONE_DAY.mask, LAST_SWAPPED_AT);
        await DCAHubSwapHandler.registerSwap(
          tokenA.address,
          tokenB.address,
          SwapInterval.ONE_DAY.mask,
          BigNumber.from(100),
          BigNumber.from(200),
          LAST_SWAPPED_AT + SwapInterval.ONE_DAY.seconds
        );
      });
      then('interval is removed from active list', async () => {
        const byteSet = await DCAHubSwapHandler.activeSwapIntervals(tokenA.address, tokenB.address);
        expect(SwapInterval.ONE_DAY.isInByteSet(byteSet)).to.be.false;
      });
      then('next delta is not modified', async () => {
        const { swapDeltaAToB, swapDeltaBToA } = await swapAmountDelta(tokenA, tokenB, SwapInterval.ONE_DAY, NEXT_SWAP + 1);
        expect(swapDeltaAToB).to.equal(0);
        expect(swapDeltaBToA).to.equal(0);
      });
      then('accum ration is not increased', async () => {
        const { accumRatioAToB, accumRatioBToA } = await accumRatio(tokenA, tokenB, SwapInterval.ONE_DAY, NEXT_SWAP);
        expect(accumRatioAToB).to.equal(0);
        expect(accumRatioBToA).to.equal(0);
      });
      then('performed swaps is not incremented', async () => {
        expect(await getPerformedSwaps(tokenA, tokenB, SwapInterval.ONE_DAY)).to.equal(NEXT_SWAP - 1);
      });
      then('last swapped at is not updated', async () => {
        expect(await lastSwappedAt(tokenA, tokenB, SwapInterval.ONE_DAY)).to.equal(LAST_SWAPPED_AT);
      });
    });

    async function getPerformedSwaps(tokenA: TokenContract, tokenB: TokenContract, swapInterval: SwapInterval) {
      const { performedSwaps } = await swapData(tokenA, tokenB, swapInterval);
      return performedSwaps;
    }

    async function lastSwappedAt(tokenA: TokenContract, tokenB: TokenContract, swapInterval: SwapInterval) {
      const { lastSwappedAt } = await swapData(tokenA, tokenB, swapInterval);
      return lastSwappedAt;
    }

    function registerSwapTest({
      title,
      tokenA,
      tokenB,
      amountToSwapTokenA,
      amountToSwapTokenB,
      nextSwapNumber,
      ratioAToB,
      ratioBToA,
      blockTimestamp,
      previous,
    }: {
      title: string;
      tokenA: () => TokenContract;
      tokenB: () => TokenContract;
      amountToSwapTokenA: BigNumberish;
      amountToSwapTokenB: BigNumberish;
      nextSwapNumber: number;
      ratioAToB: BigNumberish;
      ratioBToA: BigNumberish;
      blockTimestamp: number;
      previous?: {
        accumRatioAToB: BigNumberish;
        accumRatioBToA: BigNumberish;
      };
    }) {
      const NEXT_DELTA_FROM_A_TO_B = 20;
      const NEXT_DELTA_FROM_B_TO_A = 10;

      when(title, () => {
        given(async () => {
          await DCAHubSwapHandler.setNextAmountsToSwap(
            tokenA().address,
            tokenB().address,
            SwapInterval.ONE_DAY.mask,
            amountToSwapTokenA,
            amountToSwapTokenB
          );
          await DCAHubSwapHandler.setSwapAmountDelta(
            tokenA().address,
            tokenB().address,
            SwapInterval.ONE_DAY.mask,
            nextSwapNumber + 1,
            NEXT_DELTA_FROM_A_TO_B,
            NEXT_DELTA_FROM_B_TO_A
          );
          await DCAHubSwapHandler.setPerformedSwaps(tokenA().address, tokenB().address, SwapInterval.ONE_DAY.mask, nextSwapNumber - 1);

          if (previous) {
            await DCAHubSwapHandler.setAcummRatio(
              tokenA().address,
              tokenB().address,
              SwapInterval.ONE_DAY.mask,
              nextSwapNumber - 1,
              previous.accumRatioAToB,
              previous.accumRatioBToA
            );
          }

          await DCAHubSwapHandler.registerSwap(
            tokenA().address,
            tokenB().address,
            SwapInterval.ONE_DAY.mask,
            ratioAToB,
            ratioBToA,
            blockTimestamp
          );
        });

        then('subtracts the current delta to the next amount to swap', async () => {
          const { nextAmountToSwapAToB, nextAmountToSwapBToA } = await swapData(tokenA(), tokenB(), SwapInterval.ONE_DAY);
          expect(nextAmountToSwapAToB).to.equal(bn.toBN(amountToSwapTokenA).sub(NEXT_DELTA_FROM_A_TO_B));
          expect(nextAmountToSwapBToA).to.equal(bn.toBN(amountToSwapTokenB).sub(NEXT_DELTA_FROM_B_TO_A));
        });
        then('increments the ratio accumulator', async () => {
          const { accumRatioAToB, accumRatioBToA } = await accumRatio(tokenA(), tokenB(), SwapInterval.ONE_DAY, nextSwapNumber);
          expect(accumRatioAToB).to.equal(bn.toBN(ratioAToB).add(previous?.accumRatioAToB ?? 0));
          expect(accumRatioBToA).to.equal(bn.toBN(ratioBToA).add(previous?.accumRatioBToA ?? 0));
        });
        then('deletes swap amount delta of the following swap', async () => {
          const { swapDeltaAToB, swapDeltaBToA } = await swapAmountDelta(tokenA(), tokenB(), SwapInterval.ONE_DAY, nextSwapNumber + 1);
          expect(swapDeltaAToB).to.equal(0);
          expect(swapDeltaBToA).to.equal(0);
        });

        then('performed swaps is incremented', async () => {
          expect(await getPerformedSwaps(tokenA(), tokenB(), SwapInterval.ONE_DAY)).to.equal(nextSwapNumber);
        });

        then('last swapped at is updated', async () => {
          expect(await lastSwappedAt(tokenA(), tokenB(), SwapInterval.ONE_DAY)).to.equal(blockTimestamp);
        });
      });
    }
  });

  describe('_getTotalAmountsToSwap', () => {
    getTotalAmountsToSwapTest({
      when: 'there are no active swap intervals',
      activeIntervals: [],
      expected: {
        amountToSwapTokenA: 0,
        amountToSwapTokenB: 0,
        affectedIntervals: [],
      },
    });

    getTotalAmountsToSwapTest({
      when: 'no swap interval can be swapped right now',
      currentTimestamp: 10,
      activeIntervals: [
        {
          interval: SwapInterval.ONE_DAY,
          lastSwappedAt: 10,
          amountToSwapTokenA: 10,
          amountToSwapTokenB: 20,
        },
      ],
      expected: {
        amountToSwapTokenA: 0,
        amountToSwapTokenB: 0,
        affectedIntervals: [],
      },
    });

    getTotalAmountsToSwapTest({
      when: 'only some swap intervals can be swapped',
      currentTimestamp: SwapInterval.ONE_DAY.seconds + 1,
      activeIntervals: [
        {
          interval: SwapInterval.ONE_DAY,
          lastSwappedAt: 0,
          amountToSwapTokenA: 10,
          amountToSwapTokenB: 20,
        },
        {
          interval: SwapInterval.ONE_WEEK,
          lastSwappedAt: 0,
          amountToSwapTokenA: 30,
          amountToSwapTokenB: 50,
        },
      ],
      expected: {
        amountToSwapTokenA: 10,
        amountToSwapTokenB: 20,
        affectedIntervals: [SwapInterval.ONE_DAY],
      },
    });

    getTotalAmountsToSwapTest({
      when: 'all swap intervals can be swapped',
      currentTimestamp: SwapInterval.ONE_WEEK.seconds + 1,
      activeIntervals: [
        {
          interval: SwapInterval.ONE_DAY,
          lastSwappedAt: 0,
          amountToSwapTokenA: 10,
          amountToSwapTokenB: 20,
        },
        {
          interval: SwapInterval.ONE_WEEK,
          lastSwappedAt: 0,
          amountToSwapTokenA: 30,
          amountToSwapTokenB: 50,
        },
      ],
      expected: {
        amountToSwapTokenA: 40,
        amountToSwapTokenB: 70,
        affectedIntervals: [SwapInterval.ONE_DAY, SwapInterval.ONE_WEEK],
      },
    });

    getTotalAmountsToSwapTest({
      when: 'intervals can be technically swapped, but there are no tokens to swap',
      currentTimestamp: SwapInterval.ONE_DAY.seconds + 1,
      activeIntervals: [
        {
          interval: SwapInterval.ONE_DAY,
          lastSwappedAt: 0,
          amountToSwapTokenA: 0,
          amountToSwapTokenB: 0,
        },
      ],
      expected: {
        amountToSwapTokenA: 0,
        amountToSwapTokenB: 0,
        affectedIntervals: [],
      },
    });

    getTotalAmountsToSwapTest({
      when: `some swaps can be swapped, but the smallest one can't `,
      currentTimestamp: SwapInterval.ONE_WEEK.seconds + 1,
      activeIntervals: [
        {
          interval: SwapInterval.ONE_MINUTE,
          lastSwappedAt: SwapInterval.ONE_WEEK.seconds,
          amountToSwapTokenA: 10,
          amountToSwapTokenB: 20,
        },
        // All intervals, except the first one
        ...SwapInterval.INTERVALS.slice(1).map((interval) => ({
          interval,
          lastSwappedAt: 0,
          amountToSwapTokenA: 30,
          amountToSwapTokenB: 50,
        })),
      ],
      expected: {
        amountToSwapTokenA: 0,
        amountToSwapTokenB: 0,
        affectedIntervals: [],
      },
    });

    function getTotalAmountsToSwapTest({
      when: title,
      currentTimestamp,
      activeIntervals,
      expected,
    }: {
      when: string;
      currentTimestamp?: number;
      activeIntervals: {
        interval: SwapInterval;
        lastSwappedAt: number;
        amountToSwapTokenA: number;
        amountToSwapTokenB: number;
      }[];
      expected: {
        amountToSwapTokenA: number;
        amountToSwapTokenB: number;
        affectedIntervals: SwapInterval[];
      };
    }) {
      when(title, () => {
        given(async () => {
          await DCAHubSwapHandler.setBlockTimestamp(currentTimestamp ?? 0);
          for (const { interval, lastSwappedAt, amountToSwapTokenA, amountToSwapTokenB } of activeIntervals) {
            await DCAHubSwapHandler.setLastSwappedAt(tokenA.address, tokenB.address, interval.mask, lastSwappedAt);
            await DCAHubSwapHandler.setNextAmountsToSwap(
              tokenA.address,
              tokenB.address,
              interval.mask,
              tokenA.asUnits(amountToSwapTokenA),
              tokenB.asUnits(amountToSwapTokenB)
            );
            await DCAHubSwapHandler.addActiveSwapInterval(tokenA.address, tokenB.address, interval.mask);
          }
        });
        then('result is as expected', async () => {
          const [amountToSwapTokenA, amountToSwapTokenB, affectedIntervals] = await DCAHubSwapHandler.getTotalAmountsToSwap(
            tokenA.address,
            tokenB.address
          );
          expect(amountToSwapTokenA).to.equal(tokenA.asUnits(expected.amountToSwapTokenA));
          expect(amountToSwapTokenB).to.equal(tokenB.asUnits(expected.amountToSwapTokenB));
          expect(affectedIntervals).to.equal(SwapInterval.intervalsToByte(...expected.affectedIntervals));
        });
      });
    }
  });

  describe('_calculateRatio', () => {
    when('function is called', () => {
      let ratioAToB: BigNumber;
      let ratioBToA: BigNumber;
      given(async () => {
        setOracleData({ ratioBToA: tokenA.asUnits(0.6) });
        [ratioAToB, ratioBToA] = await DCAHubSwapHandler.calculateRatio(
          tokenA.address,
          tokenB.address,
          tokenA.magnitude,
          tokenB.magnitude,
          priceOracle.address
        );
      });
      then('ratios are calculated correctly', () => {
        const expectedRatioBToA = tokenA.asUnits(0.6);
        expect(ratioAToB).to.equal(tokenA.magnitude.mul(tokenB.magnitude).div(expectedRatioBToA));
        expect(ratioBToA).to.equal(expectedRatioBToA);
      });
    });
  });

  describe('getNextSwapInfo', () => {
    type Pair = {
      tokenA: () => TokenContract;
      tokenB: () => TokenContract;
      amountTokenA: number;
      amountTokenB: number;
      ratioBToA: number;
    };

    type Token = { token: () => TokenContract; platformFee: BigNumber; required: BigNumber; reward: BigNumber };
    type TotalAmounts = { token: () => TokenContract; available: number; needed: number };

    const FEE_RATIOS = [0, 0.5, 1];
    function getNextSwapInfoTest({ title, pairs, total }: { title: string; pairs: Pair[]; total: TotalAmounts[] }) {
      for (const protocolFeeRatio of FEE_RATIOS) {
        invidiualGetNextSwapInfoTest({
          title: title + ` (${protocolFeeRatio * 100}% protocol fee split)`,
          pairs,
          protocolFeeRatio,
          total,
        });
      }
    }

    function invidiualGetNextSwapInfoTest({
      title,
      pairs,
      protocolFeeRatio,
      total,
    }: {
      title: string;
      protocolFeeRatio: number;
      pairs: Pair[];
      total: TotalAmounts[];
    }) {
      when(title, () => {
        let expectedRatios: Map<string, { ratioAToB: BigNumber; ratioBToA: BigNumber }>;
        let expectedTokenResults: Token[];
        let swapInformation: SwapInformation;

        given(async () => {
          expectedRatios = new Map();
          await DCAHubSwapHandler.setPlatformFeeRatio(protocolFeeRatio * (await DCAHubSwapHandler.MAX_PLATFORM_FEE_RATIO()));
          for (const { tokenA, tokenB, amountTokenA, amountTokenB, ratioBToA } of pairs) {
            await DCAHubSwapHandler.setTotalAmountsToSwap(
              tokenA().address,
              tokenB().address,
              tokenA().asUnits(amountTokenA),
              tokenB().asUnits(amountTokenB),
              [SwapInterval.ONE_DAY.mask, SwapInterval.ONE_WEEK.mask]
            );
            await DCAHubSwapHandler.setRatio(tokenA().address, tokenB().address, tokenA().asUnits(ratioBToA));
            expectedRatios.set(tokenA().address + tokenB().address, {
              ratioBToA: tokenA().asUnits(ratioBToA),
              ratioAToB: tokenB().asUnits(1 / ratioBToA),
            });
          }
          expectedTokenResults = total.map(({ token, available, needed }) => {
            const availableBN = token().asUnits(available);
            const neededBN = token().asUnits(needed);

            const totalFee = CALCULATE_FEE(neededBN);
            const platformFee = totalFee.mul(protocolFeeRatio * 10).div(10);
            const swapperFee = totalFee.sub(platformFee);

            let reward = constants.ZERO;
            let required = constants.ZERO;

            if (availableBN.lt(neededBN)) {
              required = neededBN.sub(availableBN).sub(swapperFee);
            } else {
              reward = availableBN.sub(neededBN).add(swapperFee);
            }
            return { token, reward, required, platformFee };
          });
          const { tokens, pairIndexes } = buildGetNextSwapInfoInput(
            pairs.map(({ tokenA, tokenB }) => ({ tokenA: tokenA().address, tokenB: tokenB().address })),
            []
          );
          swapInformation = await DCAHubSwapHandler.getNextSwapInfo(tokens, pairIndexes);
        });

        then('ratios are expose correctly', () => {
          for (const pair of swapInformation.pairs) {
            const { ratioAToB, ratioBToA } = expectedRatios.get(pair.tokenA + pair.tokenB)!;
            expect(pair.ratioAToB).to.equal(ratioAToB);
            expect(pair.ratioBToA).to.equal(ratioBToA);
          }
        });

        then('intervals are exposed correctly', async () => {
          const byte = SwapInterval.intervalsToByte(SwapInterval.ONE_DAY, SwapInterval.ONE_WEEK);
          for (const pair of swapInformation.pairs) {
            expect(pair.intervalsInSwap).to.eql(byte);
          }
        });

        then('token amounts and roles are calculated correctly', () => {
          const tokens = new Map(swapInformation.tokens.map(({ token, ...information }) => [token, information]));
          for (const tokenData of expectedTokenResults) {
            const token = tokenData.token();
            const { reward, toProvide, platformFee } = tokens.get(token.address)!;
            expect(platformFee).to.equal(tokenData.platformFee);
            expect(toProvide).to.equal(tokenData.required);
            expect(reward).to.equal(tokenData.reward);
          }
        });
      });
    }

    function failedGetNextSwapInfoTest({
      title,
      tokens,
      pairs,
      error,
    }: {
      title: string;
      tokens: (() => TokenContract)[];
      pairs: { indexTokenA: number; indexTokenB: number }[];
      error: string;
    }) {
      when(title, () => {
        given(async () => {
          for (const { indexTokenA, indexTokenB } of pairs) {
            await DCAHubSwapHandler.setRatio(tokens[indexTokenA]().address, tokens[indexTokenB]().address, tokens[indexTokenA]().asUnits(1000));
          }
        });
        then('should revert with message', async () => {
          await behaviours.txShouldRevertWithMessage({
            contract: DCAHubSwapHandler,
            func: 'getNextSwapInfo',
            args: [tokens.map((token) => token().address), pairs],
            message: error,
          });
        });
      });
    }

    getNextSwapInfoTest({
      title: 'no pairs are sent',
      pairs: [],
      total: [],
    });

    getNextSwapInfoTest({
      title: 'only one pair, but nothing to swap for token B',
      pairs: [
        {
          tokenA: () => tokenA,
          tokenB: () => tokenB,
          amountTokenA: 100,
          amountTokenB: 0,
          ratioBToA: 2,
        },
      ],
      total: [
        {
          token: () => tokenA,
          available: 100,
          needed: 0,
        },
        {
          token: () => tokenB,
          available: 0,
          needed: 50,
        },
      ],
    });

    getNextSwapInfoTest({
      title: 'only one pair, but nothing to swap for token A',
      pairs: [
        {
          tokenA: () => tokenA,
          tokenB: () => tokenB,
          amountTokenA: 0,
          amountTokenB: 100,
          ratioBToA: 0.5,
        },
      ],
      total: [
        {
          token: () => tokenA,
          available: 0,
          needed: 50,
        },
        {
          token: () => tokenB,
          available: 100,
          needed: 0,
        },
      ],
    });

    getNextSwapInfoTest({
      title: 'only one pair, with some CoW',
      pairs: [
        {
          tokenA: () => tokenA,
          tokenB: () => tokenB,
          amountTokenA: 50,
          amountTokenB: 100,
          ratioBToA: 1,
        },
      ],
      total: [
        {
          token: () => tokenA,
          available: 50,
          needed: 100,
        },
        {
          token: () => tokenB,
          available: 100,
          needed: 50,
        },
      ],
    });

    getNextSwapInfoTest({
      title: 'only one pair, with full CoW',
      pairs: [
        {
          tokenA: () => tokenA,
          tokenB: () => tokenB,
          amountTokenA: 30,
          amountTokenB: 120,
          ratioBToA: 0.25,
        },
      ],
      total: [
        {
          token: () => tokenA,
          available: 30,
          needed: 30,
        },
        {
          token: () => tokenB,
          available: 120,
          needed: 120,
        },
      ],
    });

    getNextSwapInfoTest({
      title: 'two pairs, no CoW between them',
      pairs: [
        {
          tokenA: () => tokenA,
          tokenB: () => tokenB,
          amountTokenA: 50,
          amountTokenB: 0,
          ratioBToA: 1,
        },
        {
          tokenA: () => tokenA,
          tokenB: () => tokenC,
          amountTokenA: 50,
          amountTokenB: 0,
          ratioBToA: 1,
        },
      ],
      total: [
        {
          token: () => tokenA,
          available: 100,
          needed: 0,
        },
        {
          token: () => tokenB,
          available: 0,
          needed: 50,
        },
        {
          token: () => tokenC,
          available: 0,
          needed: 50,
        },
      ],
    });

    getNextSwapInfoTest({
      title: 'two pairs, some CoW between them',
      pairs: [
        {
          tokenA: () => tokenA,
          tokenB: () => tokenB,
          amountTokenA: 50,
          amountTokenB: 20,
          ratioBToA: 2,
        },
        {
          tokenA: () => tokenA,
          tokenB: () => tokenC,
          amountTokenA: 60,
          amountTokenB: 20,
          ratioBToA: 4,
        },
      ],
      total: [
        {
          token: () => tokenA,
          available: 110,
          needed: 120,
        },
        {
          token: () => tokenB,
          available: 20,
          needed: 25,
        },
        {
          token: () => tokenC,
          available: 20,
          needed: 15,
        },
      ],
    });

    getNextSwapInfoTest({
      title: 'two pairs, full CoW between them',
      pairs: [
        {
          tokenA: () => tokenA,
          tokenB: () => tokenB,
          amountTokenA: 50,
          amountTokenB: 20,
          ratioBToA: 2,
        },
        {
          tokenA: () => tokenA,
          tokenB: () => tokenC,
          amountTokenA: 70,
          amountTokenB: 20,
          ratioBToA: 4,
        },
      ],
      total: [
        {
          token: () => tokenA,
          available: 120,
          needed: 120,
        },
        {
          token: () => tokenB,
          available: 20,
          needed: 25,
        },
        {
          token: () => tokenC,
          available: 20,
          needed: 17.5,
        },
      ],
    });

    getNextSwapInfoTest({
      title: 'two pairs, full CoW but swapper needs to provide platform fee',
      // This is a special scenario where we require the swapper to provide a token, just to pay it fully as platform fee
      pairs: [
        {
          tokenA: () => tokenA,
          tokenB: () => tokenB,
          amountTokenA: 0,
          amountTokenB: 50,
          ratioBToA: 1,
        },
        {
          tokenA: () => tokenA,
          tokenB: () => tokenC,
          amountTokenA: 49.7,
          amountTokenB: 0,
          ratioBToA: 1,
        },
      ],
      total: [
        {
          token: () => tokenA,
          available: 49.7,
          needed: 50,
        },
        {
          token: () => tokenB,
          available: 50,
          needed: 0,
        },
        {
          token: () => tokenC,
          available: 0,
          needed: 49.7,
        },
      ],
    });

    failedGetNextSwapInfoTest({
      title: 'indexTokenA is the same as indexTokenB',
      tokens: [() => tokenA, () => tokenB],
      pairs: [
        { indexTokenA: 0, indexTokenB: 1 },
        { indexTokenA: 1, indexTokenB: 1 },
      ],
      error: 'InvalidPairs',
    });

    failedGetNextSwapInfoTest({
      title: 'indexTokenA is greater than indexTokenB',
      tokens: [() => tokenA, () => tokenB],
      pairs: [{ indexTokenA: 1, indexTokenB: 0 }],
      error: 'InvalidPairs',
    });

    failedGetNextSwapInfoTest({
      title: 'tokenA indexes are not sorted correctly',
      tokens: [() => tokenA, () => tokenB],
      pairs: [
        { indexTokenA: 1, indexTokenB: 1 },
        { indexTokenA: 0, indexTokenB: 1 },
      ],
      error: 'InvalidPairs',
    });

    failedGetNextSwapInfoTest({
      title: 'tokenA indexes are the same but tokenB indexes are not sorted correctly',
      tokens: [() => tokenA, () => tokenB, () => tokenC],
      pairs: [
        { indexTokenA: 0, indexTokenB: 2 },
        { indexTokenA: 0, indexTokenB: 1 },
      ],
      error: 'InvalidPairs',
    });

    failedGetNextSwapInfoTest({
      title: 'same pair appears twice',
      tokens: [() => tokenA, () => tokenB, () => tokenC],
      pairs: [
        { indexTokenA: 0, indexTokenB: 1 },
        { indexTokenA: 0, indexTokenB: 1 },
      ],
      error: 'InvalidPairs',
    });

    failedGetNextSwapInfoTest({
      title: 'same token appears twice',
      tokens: [() => tokenA, () => tokenA],
      pairs: [{ indexTokenA: 0, indexTokenB: 1 }],
      error: 'InvalidTokens',
    });

    failedGetNextSwapInfoTest({
      title: 'tokens are not sorted',
      tokens: [() => tokenB, () => tokenA],
      pairs: [{ indexTokenA: 0, indexTokenB: 1 }],
      error: 'InvalidTokens',
    });
  });

  const setOracleData = ({ ratioBToA }: { ratioBToA: BigNumber }) => {
    priceOracle.quote.returns(({ _amountIn }: { _amountIn: BigNumber }) => _amountIn.mul(ratioBToA).div(tokenB.magnitude));
  };

  describe('flash swap', () => {
    const BYTES = ethers.utils.randomBytes(5);
    let DCAHubSwapCallee: DCAHubSwapCalleeMock;

    given(async () => {
      const DCAHubSwapCalleeFactory: DCAHubSwapCalleeMock__factory = await ethers.getContractFactory(
        'contracts/mocks/DCAHubSwapCallee.sol:DCAHubSwapCalleeMock'
      );
      DCAHubSwapCallee = await DCAHubSwapCalleeFactory.deploy();
    });

    function flashSwapTest({
      title,
      tokens,
      pairs,
    }: {
      title: string;
      tokens: {
        token: () => TokenContract;
        reward?: number;
        toProvide?: number;
        extraToReturn?: number;
        platformFee?: number;
        borrow?: number;
      }[];
      pairs: {
        tokenA: () => TokenContract;
        tokenB: () => TokenContract;
        ratioAToB: number;
        ratioBToA: number;
        intervalsInSwap: SwapInterval[];
      }[];
    }) {
      when(title, () => {
        const BLOCK_TIMESTAMP = 30004;
        let initialBalances: Map<string, Map<TokenContract, BigNumber>>;
        let borrow: BigNumber[];
        let result: SwapInformation;
        let tx: TransactionResponse;

        given(async () => {
          const mappedTokens = tokens.map(({ token, reward, toProvide, platformFee }) => ({
            token: token().address,
            reward: !!reward ? token().asUnits(reward) : constants.ZERO,
            toProvide: !!toProvide ? token().asUnits(toProvide) : constants.ZERO,
            platformFee: !!platformFee ? token().asUnits(platformFee) : constants.ZERO,
          }));
          const mappedPairs = await Promise.all(
            pairs.map(async ({ tokenA, tokenB, ratioAToB, ratioBToA, intervalsInSwap }) => ({
              tokenA: tokenA().address,
              tokenB: tokenB().address,
              ratioAToB: BigNumber.from(ratioAToB),
              ratioBToA: BigNumber.from(ratioBToA),
              intervalsInSwap: SwapInterval.intervalsToByte(...intervalsInSwap),
            }))
          );
          result = {
            tokens: mappedTokens,
            pairs: mappedPairs,
          };
          borrow = tokens.map(({ token, borrow }) => (!!borrow ? token().asUnits(borrow!) : constants.ZERO));

          initialBalances = new Map([
            [
              DCAHubSwapCallee.address,
              new Map([
                [tokenA, tokenA.asUnits(3100)],
                [tokenB, tokenB.asUnits(200)],
                [tokenC, tokenC.asUnits(300)],
              ]),
            ],
            [
              DCAHubSwapHandler.address,
              new Map([
                [tokenA, tokenA.asUnits(200)],
                [tokenB, tokenB.asUnits(500)],
                [tokenC, tokenC.asUnits(100)],
              ]),
            ],
            [
              'platform',
              new Map([
                [tokenA, tokenA.asUnits(0)],
                [tokenB, tokenB.asUnits(50)],
                [tokenC, tokenC.asUnits(10)],
              ]),
            ],
            [
              rewardRecipient.address,
              new Map([
                [tokenA, constants.ZERO],
                [tokenB, constants.ZERO],
                [tokenC, constants.ZERO],
              ]),
            ],
          ]);

          for (const [address, balances] of initialBalances) {
            for (const [token, amount] of balances) {
              if (address === 'platform') {
                await DCAHubSwapHandler.setPlatformBalance(token.address, amount);
              } else {
                await token.mint(address, amount);
              }
            }
          }

          const addresses = tokens.map(({ token }) => token().address);
          const amounts = tokens.map(({ token, toProvide, extraToReturn, borrow }) =>
            token().asUnits((toProvide ?? 0) + (borrow ?? 0) + (extraToReturn ?? 0))
          );
          await DCAHubSwapCallee.returnSpecificAmounts(addresses, amounts);
          await DCAHubSwapCallee.avoidRewardCheck();

          const calleeBalances = initialBalances.get(DCAHubSwapCallee.address)!;
          await DCAHubSwapCallee.setInitialBalances(
            Array.from(calleeBalances.keys()).map((token) => token.address),
            Array.from(calleeBalances.values())
          );
          await DCAHubSwapHandler.setBlockTimestamp(BLOCK_TIMESTAMP);
          await DCAHubSwapHandler.setInternalGetNextSwapInfo({ tokens: mappedTokens, pairs: mappedPairs });

          tx = await DCAHubSwapHandler.connect(swapper).swap([], [], rewardRecipient.address, DCAHubSwapCallee.address, borrow, BYTES);
        });

        then(`calle's balance is modified correctly`, async () => {
          for (const { token, toProvide, extraToReturn } of tokens) {
            const initialBalance = initialBalances.get(DCAHubSwapCallee.address)!.get(token())!;
            const currentBalance = await token().balanceOf(DCAHubSwapCallee.address);
            if (toProvide) {
              expect(currentBalance).to.equal(initialBalance.sub(token().asUnits(toProvide + (extraToReturn ?? 0))));
            } else {
              expect(currentBalance).to.equal(initialBalance);
            }
          }
        });

        then(`reward recipient's balance is modified correctly`, async () => {
          for (const { token, reward, toProvide, extraToReturn } of tokens) {
            const initialBalance = initialBalances.get(rewardRecipient.address)!.get(token())!;
            const currentBalance = await token().balanceOf(rewardRecipient.address);
            if (reward) {
              expect(currentBalance).to.equal(initialBalance.add(token().asUnits(reward)));
            } else {
              expect(currentBalance).to.equal(initialBalance);
            }
          }
        });

        then(`hub's balance is modified correctly`, async () => {
          for (const { token, reward, toProvide, extraToReturn } of tokens) {
            const initialBalance = initialBalances.get(DCAHubSwapHandler.address)!.get(token())!;
            const currentBalance = await token().balanceOf(DCAHubSwapHandler.address);
            if (reward) {
              expect(currentBalance).to.equal(initialBalance.sub(token().asUnits(reward)));
            } else if (toProvide) {
              expect(currentBalance).to.equal(initialBalance.add(token().asUnits(toProvide + (extraToReturn ?? 0))));
            } else {
              expect(currentBalance).to.equal(initialBalance);
            }
          }
        });

        then('correct amount is assigned as protocol fee', async () => {
          for (const { token, platformFee, extraToReturn } of tokens) {
            const initialBalance = initialBalances.get('platform')!.get(token())!;
            const currentBalance = await DCAHubSwapHandler.platformBalance(token().address);
            if (platformFee) {
              expect(currentBalance).to.equal(initialBalance.add(token().asUnits(platformFee + (extraToReturn ?? 0))));
            } else {
              expect(currentBalance).to.equal(initialBalance);
            }
          }
        });

        then('swap is registered correctly', async () => {
          for (const pair of pairs) {
            for (const interval of pair.intervalsInSwap) {
              const call = await DCAHubSwapHandler.registerSwapCalls(pair.tokenA().address, pair.tokenB().address, interval.mask);
              expect(call.ratioAToB).to.equal(APPLY_FEE(BigNumber.from(pair.ratioAToB)));
              expect(call.ratioBToA).to.equal(APPLY_FEE(BigNumber.from(pair.ratioBToA)));
              expect(call.timestamp).to.equal(BLOCK_TIMESTAMP);
            }
          }
        });

        then('callee is called', async () => {
          const { hub, sender, tokens, borrowed, data } = await DCAHubSwapCallee.lastCall();
          expect(hub).to.equal(DCAHubSwapHandler.address);
          expect(sender).to.equal(swapper.address);
          expect(borrowed).to.eql(borrow);
          expect(data).to.equal(ethers.utils.hexlify(BYTES));

          expect(tokens.length).to.equal(result.tokens.length);
          for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            const expectedToken = result.tokens[i];
            expect(token.token).to.equal(expectedToken.token);
            expect(token.toProvide).to.equal(expectedToken.toProvide);
            expect(token.reward).to.equal(expectedToken.reward);
            expect(token.platformFee).to.equal(expectedToken.platformFee);
          }
        });

        then('event is emitted correctly', async () => {
          const sender = await readArgFromEventOrFail(tx, 'Swapped', 'sender');
          const rewardRecipientInEvent = await readArgFromEventOrFail(tx, 'Swapped', 'rewardRecipient');
          const callbackHandler = await readArgFromEventOrFail(tx, 'Swapped', 'callbackHandler');
          const swapInformation: SwapInformation = await readArgFromEventOrFail(tx, 'Swapped', 'swapInformation');
          const borrowed: BigNumber[] = await readArgFromEventOrFail(tx, 'Swapped', 'borrowed');
          const fee = await readArgFromEventOrFail(tx, 'Swapped', 'fee');
          expect(sender).to.equal(swapper.address);
          expect(rewardRecipientInEvent).to.equal(rewardRecipient.address);
          expect(callbackHandler).to.equal(DCAHubSwapCallee.address);
          expect(fee).to.equal(6000);
          expect(borrowed).to.eql(borrow);
          expect(swapInformation.pairs.length).to.equal(result.pairs.length);
          for (let i = 0; i < swapInformation.pairs.length; i++) {
            const pair = swapInformation.pairs[i];
            const expectedPair = result.pairs[i];
            expect(pair.tokenA).to.eql(expectedPair.tokenA);
            expect(pair.tokenB).to.eql(expectedPair.tokenB);
            expect(pair.ratioAToB).to.eql(expectedPair.ratioAToB);
            expect(pair.ratioBToA).to.eql(expectedPair.ratioBToA);
            expect(pair.intervalsInSwap).to.eql(expectedPair.intervalsInSwap);
          }

          expect(swapInformation.tokens.length).to.equal(result.tokens.length);
          for (let i = 0; i < swapInformation.tokens.length; i++) {
            const token = swapInformation.tokens[i];
            const expectedToken = result.tokens[i];
            expect(token.token).to.equal(expectedToken.token);
            expect(token.toProvide).to.equal(expectedToken.toProvide);
            expect(token.reward).to.equal(expectedToken.reward);
            expect(token.platformFee).to.equal(expectedToken.platformFee);
          }
        });
      });
    }

    function failedFlashSwapTest({
      title,
      tokens,
      pairs,
      error,
      initialBalanceHub,
      amountToReturn,
      context,
    }: {
      title: string;
      tokens: {
        token: () => TokenContract;
        reward?: number;
        toProvide?: number;
        borrow?: number;
      }[];
      pairs: {
        tokenA: () => TokenContract;
        tokenB: () => TokenContract;
        intervalsInSwap: SwapInterval[];
      }[];
      initialBalanceHub?: {
        token: () => TokenContract;
        amount: number;
      }[];
      amountToReturn?: {
        token: () => TokenContract;
        amount: number;
      }[];
      context?: () => Promise<any>;
      error: string;
    }) {
      when(title, () => {
        const CALLEE_INITIAL_BALANCE = 100;
        let tokensInput: string[];
        let pairIndexesInput: { indexTokenA: number; indexTokenB: number }[];
        let borrowInput: BigNumber[];

        given(async () => {
          const mappedTokens = tokens.map(({ token, reward, toProvide }) => ({
            token: token().address,
            reward: !!reward ? token().asUnits(reward) : constants.ZERO,
            toProvide: !!toProvide ? token().asUnits(toProvide) : constants.ZERO,
            platformFee: constants.ZERO,
          }));
          const mappedPairs = await Promise.all(
            pairs.map(async ({ tokenA, tokenB, intervalsInSwap }) => ({
              tokenA: tokenA().address,
              tokenB: tokenB().address,
              ratioAToB: BigNumber.from(200000),
              ratioBToA: BigNumber.from(300000),
              intervalsInSwap: SwapInterval.intervalsToByte(...intervalsInSwap),
            }))
          );
          const mappedBorrow = tokens
            .filter(({ borrow }) => !!borrow)
            .map(({ token, borrow }) => ({
              token: token().address,
              amount: token().asUnits(borrow!),
            }));

          for (const { token, amount } of initialBalanceHub ?? []) {
            await token().mint(DCAHubSwapHandler.address, token().asUnits(amount));
          }

          for (const token of [tokenA, tokenB, tokenC]) {
            await token.mint(DCAHubSwapCallee.address, token.asUnits(CALLEE_INITIAL_BALANCE));
          }
          await DCAHubSwapCallee.setInitialBalances(
            [tokenA.address, tokenB.address, tokenC.address],
            [tokenA.asUnits(CALLEE_INITIAL_BALANCE), tokenB.asUnits(CALLEE_INITIAL_BALANCE), tokenC.asUnits(CALLEE_INITIAL_BALANCE)]
          );

          if (amountToReturn) {
            const tokens = amountToReturn.map(({ token }) => token().address);
            const amounts = amountToReturn.map(({ token, amount }) => token().asUnits(amount));
            await DCAHubSwapCallee.returnSpecificAmounts(tokens, amounts);
          }

          await DCAHubSwapHandler.setInternalGetNextSwapInfo({ tokens: mappedTokens, pairs: mappedPairs });
          await context?.();

          ({ tokens: tokensInput, pairIndexes: pairIndexesInput, borrow: borrowInput } = buildSwapInput(mappedPairs, mappedBorrow));
        });

        then('should revert with message', async () => {
          await behaviours.txShouldRevertWithMessage({
            contract: DCAHubSwapHandler,
            func: 'swap(address[],(uint8,uint8)[],address,address,uint256[],bytes)',
            args: [tokensInput, pairIndexesInput, DCAHubSwapCallee.address, DCAHubSwapCallee.address, borrowInput, BYTES],
            message: error,
          });
        });
      });
    }

    flashSwapTest({
      title: 'a token that is not being swapped is borrowed',
      tokens: [
        {
          token: () => tokenA,
          toProvide: 3000,
          platformFee: 100,
        },
        {
          token: () => tokenB,
          reward: 10,
          platformFee: 1,
        },
        {
          token: () => tokenC,
          borrow: 100,
        },
      ],
      pairs: [
        {
          tokenA: () => tokenA,
          tokenB: () => tokenB,
          ratioAToB: 100000,
          ratioBToA: 20000,
          intervalsInSwap: [SwapInterval.ONE_DAY],
        },
      ],
    });

    flashSwapTest({
      title: 'tokens that are being swapped are borrowed',
      tokens: [
        {
          token: () => tokenA,
          toProvide: 3000,
          platformFee: 100,
        },
        {
          token: () => tokenB,
          reward: 10,
          platformFee: 1,
          borrow: 50,
        },
        {
          token: () => tokenC,
          reward: 50,
          borrow: 50,
        },
      ],
      pairs: [
        {
          tokenA: () => tokenA,
          tokenB: () => tokenB,
          ratioAToB: 100000,
          ratioBToA: 20000,
          intervalsInSwap: [SwapInterval.ONE_DAY],
        },
        {
          tokenA: () => tokenA,
          tokenB: () => tokenC,
          ratioAToB: 5000,
          ratioBToA: 100,
          intervalsInSwap: [SwapInterval.ONE_DAY, SwapInterval.ONE_WEEK],
        },
      ],
    });

    flashSwapTest({
      title: 'some extra tokens are returned',
      tokens: [
        {
          token: () => tokenA,
          toProvide: 3000,
          extraToReturn: 100,
          platformFee: 100,
        },
        {
          token: () => tokenB,
          reward: 10,
          platformFee: 1,
          borrow: 50,
        },
        {
          token: () => tokenC,
          reward: 50,
          borrow: 50,
        },
      ],
      pairs: [
        {
          tokenA: () => tokenA,
          tokenB: () => tokenB,
          ratioAToB: 100000,
          ratioBToA: 20000,
          intervalsInSwap: [SwapInterval.ONE_DAY],
        },
        {
          tokenA: () => tokenA,
          tokenB: () => tokenC,
          ratioAToB: 5000,
          ratioBToA: 100,
          intervalsInSwap: [SwapInterval.ONE_DAY, SwapInterval.ONE_WEEK],
        },
      ],
    });

    failedFlashSwapTest({
      title: 'swapping is paused',
      context: () => DCAHubSwapHandler.pause(),
      tokens: [],
      pairs: [],
      error: 'Pausable: paused',
    });

    failedFlashSwapTest({
      title: 'there are no swaps to execute',
      tokens: [
        {
          token: () => tokenA,
          reward: 100,
        },
      ],
      pairs: [
        {
          tokenA: () => tokenA,
          tokenB: () => tokenB,
          intervalsInSwap: [],
        },
      ],
      error: 'NoSwapsToExecute',
    });

    failedFlashSwapTest({
      title: 'the amount to provide is not returned',
      tokens: [
        {
          token: () => tokenA,
          toProvide: 100,
        },
      ],
      pairs: [
        {
          tokenA: () => tokenA,
          tokenB: () => tokenB,
          intervalsInSwap: [SwapInterval.ONE_DAY],
        },
      ],
      amountToReturn: [
        {
          token: () => tokenA,
          amount: 99,
        },
      ],
      error: 'LiquidityNotReturned',
    });

    failedFlashSwapTest({
      title: 'the amount borrowed is not returned',
      tokens: [
        {
          token: () => tokenA,
          toProvide: 50,
          borrow: 50,
        },
      ],
      pairs: [
        {
          tokenA: () => tokenA,
          tokenB: () => tokenB,
          intervalsInSwap: [SwapInterval.ONE_DAY],
        },
      ],
      initialBalanceHub: [
        {
          token: () => tokenA,
          amount: 50,
        },
      ],
      amountToReturn: [
        {
          token: () => tokenA,
          amount: 99,
        },
      ],
      error: 'LiquidityNotReturned',
    });

    failedFlashSwapTest({
      title: 'the amount to reward is not available',
      tokens: [
        {
          token: () => tokenA,
          reward: 100,
        },
      ],
      pairs: [
        {
          tokenA: () => tokenA,
          tokenB: () => tokenB,
          intervalsInSwap: [SwapInterval.ONE_DAY],
        },
      ],
      initialBalanceHub: [
        {
          token: () => tokenA,
          amount: 99,
        },
      ],
      error: 'ERC20: transfer amount exceeds balance',
    });

    failedFlashSwapTest({
      title: 'swapper borrows more than is available',
      tokens: [
        {
          token: () => tokenA,
          reward: 50,
          borrow: 50,
        },
      ],
      pairs: [
        {
          tokenA: () => tokenA,
          tokenB: () => tokenB,
          intervalsInSwap: [SwapInterval.ONE_DAY],
        },
      ],
      initialBalanceHub: [
        {
          token: () => tokenA,
          amount: 99,
        },
      ],
      error: 'ERC20: transfer amount exceeds balance',
    });
  });

  async function swapAmountDelta(tokenA: TokenContract, tokenB: TokenContract, swapInterval: SwapInterval, swap: number) {
    return DCAHubSwapHandler.swapAmountDelta(tokenA.address, tokenB.address, swapInterval.mask, swap);
  }

  async function swapData(tokenA: TokenContract, tokenB: TokenContract, swapInterval: SwapInterval) {
    return DCAHubSwapHandler.swapData(tokenA.address, tokenB.address, swapInterval.mask);
  }

  async function accumRatio(tokenA: TokenContract, tokenB: TokenContract, swapInterval: SwapInterval, swap: number) {
    return DCAHubSwapHandler.accumRatio(tokenA.address, tokenB.address, swapInterval.mask, swap);
  }

  type SwapInformation = {
    tokens: { token: string; reward: BigNumber; toProvide: BigNumber; platformFee: BigNumber }[];
    pairs: { tokenA: string; tokenB: string; ratioAToB: BigNumber; ratioBToA: BigNumber; intervalsInSwap: string }[];
  };
});
