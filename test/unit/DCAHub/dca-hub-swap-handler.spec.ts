import moment from 'moment';
import { expect } from 'chai';
import { BigNumber, BigNumberish, Contract } from 'ethers';
import { ethers } from 'hardhat';
import { DCAHubSwapHandlerMock, DCAHubSwapHandlerMock__factory, TimeWeightedOracleMock, TimeWeightedOracleMock__factory } from '@typechained';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { constants, erc20, bn, behaviours } from '@test-utils';
import { contract, given, then, when } from '@test-utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { readArgFromEventOrFail } from '@test-utils/event-utils';
import { TokenContract } from '@test-utils/erc20';
import { snapshot } from '@test-utils/evm';
import { buildGetNextSwapInfoInput, buildSwapInput } from 'js-lib/swap-utils';

const CALCULATE_FEE = (bn: BigNumber) => bn.mul(6).div(1000);
const APPLY_FEE = (bn: BigNumber) => bn.mul(994).div(1000);

contract('DCAHubSwapHandler', () => {
  let owner: SignerWithAddress;
  let swapper: SignerWithAddress;
  let tokenA: TokenContract, tokenB: TokenContract, tokenC: TokenContract;
  let DCAHubSwapHandlerContract: DCAHubSwapHandlerMock__factory;
  let DCAHubSwapHandler: DCAHubSwapHandlerMock;
  let timeWeightedOracleContract: TimeWeightedOracleMock__factory;
  let timeWeightedOracle: TimeWeightedOracleMock;
  let snapshotId: string;
  const SWAP_INTERVAL = moment.duration(1, 'days').as('seconds');
  const SWAP_INTERVAL_2 = moment.duration(1, 'week').as('seconds');

  before('Setup accounts and contracts', async () => {
    [owner, swapper] = await ethers.getSigners();
    DCAHubSwapHandlerContract = await ethers.getContractFactory('contracts/mocks/DCAHub/DCAHubSwapHandler.sol:DCAHubSwapHandlerMock');
    timeWeightedOracleContract = await ethers.getContractFactory('contracts/mocks/DCAHub/TimeWeightedOracleMock.sol:TimeWeightedOracleMock');

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

    timeWeightedOracle = await timeWeightedOracleContract.deploy(0, 0);
    DCAHubSwapHandler = await DCAHubSwapHandlerContract.deploy(owner.address, owner.address, timeWeightedOracle.address);
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
      const NEXT_AVAILABLE = 50;

      given(async () => {
        await DCAHubSwapHandler.addActiveSwapInterval(tokenA.address, tokenB.address, SWAP_INTERVAL);
        await DCAHubSwapHandler.setPerformedSwaps(tokenA.address, tokenB.address, SWAP_INTERVAL, NEXT_SWAP - 1);
        await DCAHubSwapHandler.setNextSwapAvailable(tokenA.address, tokenB.address, SWAP_INTERVAL, NEXT_AVAILABLE);
        await DCAHubSwapHandler.registerSwap(
          tokenA.address,
          tokenB.address,
          SWAP_INTERVAL,
          BigNumber.from(100),
          BigNumber.from(200),
          NEXT_AVAILABLE + 10
        );
      });
      then('interval is removed from active list', async () => {
        expect(await DCAHubSwapHandler.isSwapIntervalActive(tokenA.address, tokenB.address, SWAP_INTERVAL)).to.be.false;
      });
      then('next delta is not modified', async () => {
        const { swapDeltaAToB, swapDeltaBToA } = await swapAmountDelta(tokenA, tokenB, SWAP_INTERVAL, NEXT_SWAP + 1);
        expect(swapDeltaAToB).to.equal(0);
        expect(swapDeltaBToA).to.equal(0);
      });
      then('rate per unit is not increased', async () => {
        const { accumRatioAToB, accumRatioBToA } = await accumRatio(tokenA, tokenB, SWAP_INTERVAL, NEXT_SWAP);
        expect(accumRatioAToB).to.equal(0);
        expect(accumRatioBToA).to.equal(0);
      });
      then('performed swaps is not incremented', async () => {
        expect(await getPerformedSwaps(tokenA, tokenB, SWAP_INTERVAL)).to.equal(NEXT_SWAP - 1);
      });
      then('next available is not updated', async () => {
        expect(await nextSwapAvailable(tokenA, tokenB, SWAP_INTERVAL)).to.equal(NEXT_AVAILABLE);
      });
    });

    async function getPerformedSwaps(tokenA: TokenContract, tokenB: TokenContract, swapInterval: number) {
      const { performedSwaps } = await swapData(tokenA, tokenB, swapInterval);
      return performedSwaps;
    }

    async function nextSwapAvailable(tokenA: TokenContract, tokenB: TokenContract, swapInterval: number) {
      const { nextSwapAvailable } = await swapData(tokenA, tokenB, swapInterval);
      return nextSwapAvailable;
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
            SWAP_INTERVAL,
            amountToSwapTokenA,
            amountToSwapTokenB
          );
          await DCAHubSwapHandler.setSwapAmountDelta(
            tokenA().address,
            tokenB().address,
            SWAP_INTERVAL,
            nextSwapNumber + 1,
            NEXT_DELTA_FROM_A_TO_B,
            NEXT_DELTA_FROM_B_TO_A
          );
          await DCAHubSwapHandler.setPerformedSwaps(tokenA().address, tokenB().address, SWAP_INTERVAL, nextSwapNumber - 1);

          if (previous) {
            await DCAHubSwapHandler.setAcummRatio(
              tokenA().address,
              tokenB().address,
              SWAP_INTERVAL,
              nextSwapNumber - 1,
              previous.accumRatioAToB,
              previous.accumRatioBToA
            );
          }

          await DCAHubSwapHandler.registerSwap(tokenA().address, tokenB().address, SWAP_INTERVAL, ratioAToB, ratioBToA, blockTimestamp);
        });

        then('adds the current delta to the next amount to swap', async () => {
          const { nextAmountToSwapAToB, nextAmountToSwapBToA } = await swapData(tokenA(), tokenB(), SWAP_INTERVAL);
          expect(nextAmountToSwapAToB).to.equal(bn.toBN(amountToSwapTokenA).add(NEXT_DELTA_FROM_A_TO_B));
          expect(nextAmountToSwapBToA).to.equal(bn.toBN(amountToSwapTokenB).add(NEXT_DELTA_FROM_B_TO_A));
        });
        then('increments the rate per unit accumulator', async () => {
          const { accumRatioAToB, accumRatioBToA } = await accumRatio(tokenA(), tokenB(), SWAP_INTERVAL, nextSwapNumber);
          expect(accumRatioAToB).to.equal(bn.toBN(ratioAToB).add(previous?.accumRatioAToB ?? 0));
          expect(accumRatioBToA).to.equal(bn.toBN(ratioBToA).add(previous?.accumRatioBToA ?? 0));
        });
        then('deletes swap amount delta of the following swap', async () => {
          const { swapDeltaAToB, swapDeltaBToA } = await swapAmountDelta(tokenA(), tokenB(), SWAP_INTERVAL, nextSwapNumber + 1);
          expect(swapDeltaAToB).to.equal(0);
          expect(swapDeltaBToA).to.equal(0);
        });

        then('performed swaps is incremented', async () => {
          expect(await getPerformedSwaps(tokenA(), tokenB(), SWAP_INTERVAL)).to.equal(nextSwapNumber);
        });

        then('next available is updated', async () => {
          const nextTimestamp = (Math.floor(blockTimestamp / SWAP_INTERVAL) + 1) * SWAP_INTERVAL;
          expect(await nextSwapAvailable(tokenA(), tokenB(), SWAP_INTERVAL)).to.equal(nextTimestamp);
        });
      });
    }
  });

  describe('_getTotalAmountsToSwap', () => {
    when('there are no active swap intervals', () => {
      then('nothing is returned', async () => {
        const [amountToSwapTokenA, amountToSwapTokenB, affectedIntervals] = await DCAHubSwapHandler.getTotalAmountsToSwap(
          tokenA.address,
          tokenB.address
        );
        expect(amountToSwapTokenA).to.equal(0);
        expect(amountToSwapTokenB).to.equal(0);
        expect(affectedIntervals).to.equal('0x00');
      });
    });
    when('no swap interval can be swapped right now', () => {
      given(async () => {
        await DCAHubSwapHandler.setBlockTimestamp(10);
        await DCAHubSwapHandler.setNextSwapAvailable(tokenA.address, tokenB.address, SWAP_INTERVAL, 20);
        await DCAHubSwapHandler.setNextAmountsToSwap(tokenA.address, tokenB.address, SWAP_INTERVAL, tokenA.asUnits(10), tokenB.asUnits(20));
        await DCAHubSwapHandler.addActiveSwapInterval(tokenA.address, tokenB.address, SWAP_INTERVAL);
      });
      then('nothing is returned', async () => {
        const [amountToSwapTokenA, amountToSwapTokenB, affectedIntervals] = await DCAHubSwapHandler.getTotalAmountsToSwap(
          tokenA.address,
          tokenB.address
        );
        expect(amountToSwapTokenA).to.equal(0);
        expect(amountToSwapTokenB).to.equal(0);
        expect(affectedIntervals).to.equal('0x00');
      });
    });
    when('only some swap intervals can be swapped', () => {
      given(async () => {
        await DCAHubSwapHandler.setBlockTimestamp(15);
        await DCAHubSwapHandler.setNextSwapAvailable(tokenA.address, tokenB.address, SWAP_INTERVAL, 20);
        await DCAHubSwapHandler.setNextSwapAvailable(tokenA.address, tokenB.address, SWAP_INTERVAL_2, 10);
        await DCAHubSwapHandler.setNextAmountsToSwap(tokenA.address, tokenB.address, SWAP_INTERVAL, tokenA.asUnits(10), tokenB.asUnits(20));
        await DCAHubSwapHandler.setNextAmountsToSwap(tokenA.address, tokenB.address, SWAP_INTERVAL_2, tokenA.asUnits(30), tokenB.asUnits(50));
        await DCAHubSwapHandler.addActiveSwapInterval(tokenA.address, tokenB.address, SWAP_INTERVAL);
        await DCAHubSwapHandler.addActiveSwapInterval(tokenA.address, tokenB.address, SWAP_INTERVAL_2);
      });
      then('they are returned correctly', async () => {
        const [amountToSwapTokenA, amountToSwapTokenB, affectedIntervals] = await DCAHubSwapHandler.getTotalAmountsToSwap(
          tokenA.address,
          tokenB.address
        );
        expect(amountToSwapTokenA).to.equal(tokenA.asUnits(30));
        expect(amountToSwapTokenB).to.equal(tokenB.asUnits(50));
        expect(affectedIntervals).to.eql(await intervalsToByte(SWAP_INTERVAL_2));
      });
    });
    when('all swap intervals can be swapped', () => {
      given(async () => {
        await DCAHubSwapHandler.setBlockTimestamp(20);
        await DCAHubSwapHandler.setNextSwapAvailable(tokenA.address, tokenB.address, SWAP_INTERVAL, 10);
        await DCAHubSwapHandler.setNextSwapAvailable(tokenA.address, tokenB.address, SWAP_INTERVAL_2, 15);
        await DCAHubSwapHandler.setNextAmountsToSwap(tokenA.address, tokenB.address, SWAP_INTERVAL, tokenA.asUnits(10), tokenB.asUnits(20));
        await DCAHubSwapHandler.setNextAmountsToSwap(tokenA.address, tokenB.address, SWAP_INTERVAL_2, tokenA.asUnits(30), tokenB.asUnits(50));
        await DCAHubSwapHandler.addActiveSwapInterval(tokenA.address, tokenB.address, SWAP_INTERVAL);
        await DCAHubSwapHandler.addActiveSwapInterval(tokenA.address, tokenB.address, SWAP_INTERVAL_2);
      });
      then('they are returned correctly', async () => {
        const [amountToSwapTokenA, amountToSwapTokenB, affectedIntervals] = await DCAHubSwapHandler.getTotalAmountsToSwap(
          tokenA.address,
          tokenB.address
        );
        expect(amountToSwapTokenA).to.equal(tokenA.asUnits(40));
        expect(amountToSwapTokenB).to.equal(tokenB.asUnits(70));
        expect(affectedIntervals).to.eql(await intervalsToByte(SWAP_INTERVAL, SWAP_INTERVAL_2));
      });
    });
    when('intervals can be technically swapped, but there are no tokens to swap', () => {
      given(async () => {
        await DCAHubSwapHandler.setBlockTimestamp(20);
        await DCAHubSwapHandler.setNextSwapAvailable(tokenA.address, tokenB.address, SWAP_INTERVAL, 10);
        await DCAHubSwapHandler.setNextAmountsToSwap(tokenA.address, tokenB.address, SWAP_INTERVAL, 0, 0);
        await DCAHubSwapHandler.addActiveSwapInterval(tokenA.address, tokenB.address, SWAP_INTERVAL);
      });
      then('they nothing is returned', async () => {
        const [amountToSwapTokenA, amountToSwapTokenB, affectedIntervals] = await DCAHubSwapHandler.getTotalAmountsToSwap(
          tokenA.address,
          tokenB.address
        );
        expect(amountToSwapTokenA).to.equal(0);
        expect(amountToSwapTokenB).to.equal(0);
        expect(affectedIntervals).to.eql('0x00');
      });
    });
  });

  describe('_calculateRatio', () => {
    when('function is called', () => {
      let ratioAToB: BigNumber;
      let ratioBToA: BigNumber;
      given(async () => {
        await setOracleData({ ratioBToA: tokenA.asUnits(0.6) });
        [ratioAToB, ratioBToA] = await DCAHubSwapHandler.calculateRatio(
          tokenA.address,
          tokenB.address,
          tokenA.magnitude,
          tokenB.magnitude,
          timeWeightedOracle.address
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

    type Token = { token: () => TokenContract } & ({ CoW: number } | { platformFee: number }) & ({ required: number } | { reward: number } | {});

    function getNextSwapInfoTest({ title, pairs, result }: { title: string; pairs: Pair[]; result: Token[] }) {
      when(title, () => {
        let expectedRatios: Map<string, { ratioAToB: BigNumber; ratioBToA: BigNumber }>;
        let swapInformation: SwapInformation;

        given(async () => {
          expectedRatios = new Map();
          for (const { tokenA, tokenB, amountTokenA, amountTokenB, ratioBToA } of pairs) {
            await DCAHubSwapHandler.setTotalAmountsToSwap(
              tokenA().address,
              tokenB().address,
              tokenA().asUnits(amountTokenA),
              tokenB().asUnits(amountTokenB),
              [SWAP_INTERVAL, SWAP_INTERVAL_2]
            );
            await DCAHubSwapHandler.setRatio(tokenA().address, tokenB().address, tokenA().asUnits(ratioBToA));
            expectedRatios.set(tokenA().address + tokenB().address, {
              ratioBToA: tokenA().asUnits(ratioBToA),
              ratioAToB: tokenB().asUnits(1 / ratioBToA),
            });
          }
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
          const byte = await intervalsToByte(SWAP_INTERVAL, SWAP_INTERVAL_2);
          for (const pair of swapInformation.pairs) {
            expect(pair.intervalsInSwap).to.eql(byte);
          }
        });

        then('token amounts and roles are calculated correctly', () => {
          const tokens = new Map(swapInformation.tokens.map(({ token, ...information }) => [token, information]));
          for (const tokenData of result) {
            const token = tokenData.token();
            const { reward, toProvide, platformFee } = tokens.get(token.address)!;
            if ('CoW' in tokenData) {
              expect(platformFee).to.equal(CALCULATE_FEE(token.asUnits(tokenData.CoW)));
            } else {
              expect(platformFee).to.equal(APPLY_FEE(token.asUnits(tokenData.platformFee)));
            }
            if ('required' in tokenData) {
              expect(toProvide).to.equal(APPLY_FEE(token.asUnits(tokenData.required)));
              expect(reward).to.equal(0);
            } else if ('reward' in tokenData) {
              expect(reward).to.equal(token.asUnits(tokenData.reward));
              expect(toProvide).to.equal(0);
            } else {
              expect(reward).to.equal(0);
              expect(toProvide).to.equal(0);
            }
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
      result: [],
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
      result: [
        {
          token: () => tokenA,
          CoW: 0,
          reward: 100,
        },
        {
          token: () => tokenB,
          CoW: 0,
          required: 50,
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
      result: [
        {
          token: () => tokenA,
          CoW: 0,
          required: 50,
        },
        {
          token: () => tokenB,
          CoW: 0,
          reward: 100,
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
      result: [
        {
          token: () => tokenA,
          CoW: 50,
          required: 50,
        },
        {
          token: () => tokenB,
          CoW: 50,
          reward: 50,
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
      result: [
        {
          token: () => tokenA,
          CoW: 30,
        },
        {
          token: () => tokenB,
          CoW: 120,
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
      result: [
        {
          token: () => tokenA,
          CoW: 0,
          reward: 100,
        },
        {
          token: () => tokenB,
          CoW: 0,
          required: 50,
        },
        {
          token: () => tokenC,
          CoW: 0,
          required: 50,
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
      result: [
        {
          token: () => tokenA,
          CoW: 110,
          required: 10,
        },
        {
          token: () => tokenB,
          CoW: 20,
          required: 5,
        },
        {
          token: () => tokenC,
          CoW: 15,
          reward: 5,
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
      result: [
        {
          token: () => tokenA,
          CoW: 120,
        },
        {
          token: () => tokenB,
          CoW: 20,
          required: 5,
        },
        {
          token: () => tokenC,
          CoW: 17.5,
          reward: 2.5,
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
      result: [
        {
          token: () => tokenA,
          platformFee: 0.3,
          required: 0.3,
        },
        {
          token: () => tokenB,
          CoW: 0,
          reward: 50,
        },
        {
          token: () => tokenC,
          CoW: 0,
          required: 49.7,
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

  const setOracleData = async ({ ratioBToA }: { ratioBToA: BigNumber }) => {
    await timeWeightedOracle.setRate(ratioBToA, tokenB.amountOfDecimals);
  };

  describe('flash swap', () => {
    const BYTES = ethers.utils.randomBytes(5);
    let DCAHubSwapCallee: Contract;

    given(async () => {
      const DCAHubSwapCalleeFactory = await ethers.getContractFactory('contracts/mocks/DCAHubSwapCallee.sol:DCAHubSwapCalleeMock');
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
        platformFee?: number;
        borrow?: number;
      }[];
      pairs: {
        tokenA: () => TokenContract;
        tokenB: () => TokenContract;
        ratioAToB: number;
        ratioBToA: number;
        intervalsInSwap: number[];
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
              intervalsInSwap: await intervalsToByte(...intervalsInSwap),
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
                [tokenA, tokenA.asUnits(3000)],
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

          const calleeBalances = initialBalances.get(DCAHubSwapCallee.address)!;
          await DCAHubSwapCallee.setInitialBalances(
            Array.from(calleeBalances.keys()).map((token) => token.address),
            Array.from(calleeBalances.values())
          );
          await DCAHubSwapHandler.setBlockTimestamp(BLOCK_TIMESTAMP);
          await DCAHubSwapHandler.setInternalGetNextSwapInfo({ tokens: mappedTokens, pairs: mappedPairs });

          tx = await DCAHubSwapHandler.connect(swapper).swap([], [], borrow, DCAHubSwapCallee.address, BYTES);
        });

        then(`calle's balance is modified correctly`, async () => {
          for (const { token, reward, toProvide } of tokens) {
            const initialBalance = initialBalances.get(DCAHubSwapCallee.address)!.get(token())!;
            const currentBalance = await token().balanceOf(DCAHubSwapCallee.address);
            if (reward) {
              expect(currentBalance).to.equal(initialBalance.add(token().asUnits(reward)));
            } else if (toProvide) {
              expect(currentBalance).to.equal(initialBalance.sub(token().asUnits(toProvide)));
            } else {
              expect(currentBalance).to.equal(initialBalance);
            }
          }
        });

        then(`hub's balance is modified correctly`, async () => {
          for (const { token, reward, toProvide } of tokens) {
            const initialBalance = initialBalances.get(DCAHubSwapHandler.address)!.get(token())!;
            const currentBalance = await token().balanceOf(DCAHubSwapHandler.address);
            if (reward) {
              expect(currentBalance).to.equal(initialBalance.sub(token().asUnits(reward)));
            } else if (toProvide) {
              expect(currentBalance).to.equal(initialBalance.add(token().asUnits(toProvide)));
            } else {
              expect(currentBalance).to.equal(initialBalance);
            }
          }
        });

        then('correct amount is assigned as protocol fee', async () => {
          for (const { token, platformFee } of tokens) {
            const initialBalance = initialBalances.get('platform')!.get(token())!;
            const currentBalance = await DCAHubSwapHandler.platformBalance(token().address);
            if (platformFee) {
              expect(currentBalance).to.equal(initialBalance.add(token().asUnits(platformFee)));
            } else {
              expect(currentBalance).to.equal(initialBalance);
            }
          }
        });

        then('swap is registered correctly', async () => {
          for (const pair of pairs) {
            for (const interval of pair.intervalsInSwap) {
              const call = await DCAHubSwapHandler.registerSwapCalls(pair.tokenA().address, pair.tokenB().address, interval);
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
          const to = await readArgFromEventOrFail(tx, 'Swapped', 'to');
          const swapInformation: SwapInformation = await readArgFromEventOrFail(tx, 'Swapped', 'swapInformation');
          const borrowed: BigNumber[] = await readArgFromEventOrFail(tx, 'Swapped', 'borrowed');
          const fee = await readArgFromEventOrFail(tx, 'Swapped', 'fee');
          expect(sender).to.equal(swapper.address);
          expect(to).to.equal(DCAHubSwapCallee.address);
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
        intervalsInSwap: number[];
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
              intervalsInSwap: await intervalsToByte(...intervalsInSwap),
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
            func: 'swap(address[],(uint8,uint8)[],uint256[],address,bytes)',
            args: [tokensInput, pairIndexesInput, borrowInput, DCAHubSwapCallee.address, BYTES],
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
          intervalsInSwap: [SWAP_INTERVAL],
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
          intervalsInSwap: [SWAP_INTERVAL],
        },
        {
          tokenA: () => tokenA,
          tokenB: () => tokenC,
          ratioAToB: 5000,
          ratioBToA: 100,
          intervalsInSwap: [SWAP_INTERVAL, SWAP_INTERVAL_2],
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
          intervalsInSwap: [SWAP_INTERVAL],
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
          intervalsInSwap: [SWAP_INTERVAL],
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
          intervalsInSwap: [SWAP_INTERVAL],
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
          intervalsInSwap: [SWAP_INTERVAL],
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

  describe('secondsUntilNextSwap', () => {
    secondsUntilNextSwapTest({
      title: 'no pairs are passed',
      pairs: [],
      currentTimestamp: 1000,
      expected: [],
    });

    secondsUntilNextSwapTest({
      title: 'there are not active intervals for the given pair',
      pairs: [
        {
          tokenA: () => tokenA,
          tokenB: () => tokenB,
          intervals: [],
        },
      ],
      currentTimestamp: 1000,
      expected: [2 ** 32 - 1],
    });

    secondsUntilNextSwapTest({
      title: 'one of the intervals can be swapped for the given pair',
      pairs: [
        {
          tokenA: () => tokenA,
          tokenB: () => tokenB,
          intervals: [
            {
              interval: SWAP_INTERVAL,
              nextAvailable: 1000,
            },
            {
              interval: SWAP_INTERVAL_2,
              nextAvailable: 1001,
            },
          ],
        },
      ],
      currentTimestamp: 1000,
      expected: [0],
    });

    secondsUntilNextSwapTest({
      title: 'none of the intervals can be swapped right now for the given pair',
      pairs: [
        {
          tokenA: () => tokenA,
          tokenB: () => tokenB,
          intervals: [
            {
              interval: SWAP_INTERVAL,
              nextAvailable: 1500,
            },
            {
              interval: SWAP_INTERVAL_2,
              nextAvailable: 1200,
            },
          ],
        },
      ],
      currentTimestamp: 1000,
      expected: [200],
    });

    secondsUntilNextSwapTest({
      title: 'many pairs are provided',
      pairs: [
        {
          tokenA: () => tokenA,
          tokenB: () => tokenB,
          intervals: [{ interval: SWAP_INTERVAL_2, nextAvailable: 1200 }],
        },
        {
          tokenA: () => tokenA,
          tokenB: () => tokenC,
          intervals: [{ interval: SWAP_INTERVAL, nextAvailable: 500 }],
        },
      ],
      currentTimestamp: 1000,
      expected: [200, 0],
    });

    async function secondsUntilNextSwapTest({
      title,
      pairs,
      currentTimestamp,
      expected,
    }: {
      title: string;
      pairs: {
        tokenA: () => TokenContract;
        tokenB: () => TokenContract;
        intervals: { interval: number; nextAvailable: number }[];
      }[];
      currentTimestamp: number;
      expected: number[];
    }) {
      when(title, () => {
        given(async () => {
          for (const { tokenA, tokenB, intervals } of pairs) {
            for (const { interval, nextAvailable } of intervals) {
              await DCAHubSwapHandler.addActiveSwapInterval(tokenA().address, tokenB().address, interval);
              await DCAHubSwapHandler.setNextSwapAvailable(tokenA().address, tokenB().address, interval, nextAvailable);
            }
          }
          await DCAHubSwapHandler.setBlockTimestamp(currentTimestamp);
        });

        then('result is as expected', async () => {
          const input = pairs.map(({ tokenA, tokenB }) => ({ tokenA: tokenA().address, tokenB: tokenB().address }));
          const result = await DCAHubSwapHandler.secondsUntilNextSwap(input);
          expect(result).to.eql(expected);
        });
      });
    }
  });

  async function intervalsToByte(...intervals: number[]) {
    if (intervals.length === 0) {
      return '0x00';
    }
    const masks = await Promise.all(intervals.map((interval) => DCAHubSwapHandler.intervalToMask(interval)));
    const finalMask = masks.map((mask) => parseInt(mask)).reduce((a, b) => a | b, 0);
    return '0x' + finalMask.toString(16);
  }

  async function swapAmountDelta(tokenA: TokenContract, tokenB: TokenContract, swapInterval: number, swap: number) {
    return DCAHubSwapHandler.swapAmountDelta(tokenA.address, tokenB.address, await DCAHubSwapHandler.intervalToMask(swapInterval), swap);
  }

  async function swapData(tokenA: TokenContract, tokenB: TokenContract, swapInterval: number) {
    return DCAHubSwapHandler.swapData(tokenA.address, tokenB.address, await DCAHubSwapHandler.intervalToMask(swapInterval));
  }

  async function accumRatio(tokenA: TokenContract, tokenB: TokenContract, swapInterval: number, swap: number) {
    return DCAHubSwapHandler.accumRatio(tokenA.address, tokenB.address, await DCAHubSwapHandler.intervalToMask(swapInterval), swap);
  }

  type SwapInformation = {
    tokens: { token: string; reward: BigNumber; toProvide: BigNumber; platformFee: BigNumber }[];
    pairs: { tokenA: string; tokenB: string; ratioAToB: BigNumber; ratioBToA: BigNumber; intervalsInSwap: string }[];
  };
});
