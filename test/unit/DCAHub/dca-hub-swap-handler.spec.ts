import moment from 'moment';
import { expect } from 'chai';
import { BigNumber, BigNumberish, Contract, Wallet } from 'ethers';
import { ethers } from 'hardhat';
import {
  DCAGlobalParametersMock__factory,
  DCAGlobalParametersMock,
  DCAHubSwapHandlerMock,
  DCAHubSwapHandlerMock__factory,
  TimeWeightedOracleMock,
  TimeWeightedOracleMock__factory,
} from '@typechained';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { constants, erc20, behaviours, evm, bn, wallet } from '@test-utils';
import { given, then, when } from '@test-utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { readArgFromEvent } from '@test-utils/event-utils';
import { TokenContract } from '@test-utils/erc20';
import { snapshot } from '@test-utils/evm';
import { buildSwapInput } from 'js-lib/swap-utils';

const CALCULATE_FEE = (bn: BigNumber) => bn.mul(6).div(1000);
const APPLY_FEE = (bn: BigNumber) => bn.sub(CALCULATE_FEE(bn));

describe('DCAHubSwapHandler', () => {
  let owner: SignerWithAddress;
  let feeRecipient: SignerWithAddress;
  let tokenA: TokenContract, tokenB: TokenContract;
  let DCAHubSwapHandlerContract: DCAHubSwapHandlerMock__factory;
  let DCAHubSwapHandler: DCAHubSwapHandlerMock;
  let timeWeightedOracleContract: TimeWeightedOracleMock__factory;
  let timeWeightedOracle: TimeWeightedOracleMock;
  let DCAGlobalParametersContract: DCAGlobalParametersMock__factory;
  let DCAGlobalParameters: DCAGlobalParametersMock;
  let snapshotId: string;
  const SWAP_INTERVAL = moment.duration(1, 'days').as('seconds');
  const SWAP_INTERVAL_2 = moment.duration(2, 'days').as('seconds');

  before('Setup accounts and contracts', async () => {
    [owner, feeRecipient] = await ethers.getSigners();
    DCAGlobalParametersContract = await ethers.getContractFactory(
      'contracts/mocks/DCAGlobalParameters/DCAGlobalParameters.sol:DCAGlobalParametersMock'
    );
    DCAHubSwapHandlerContract = await ethers.getContractFactory('contracts/mocks/DCAHub/DCAHubSwapHandler.sol:DCAHubSwapHandlerMock');
    timeWeightedOracleContract = await ethers.getContractFactory('contracts/mocks/DCAHub/TimeWeightedOracleMock.sol:TimeWeightedOracleMock');
    tokenA = await erc20.deploy({
      name: 'tokenA',
      symbol: 'TKN0',
      decimals: 12,
      initialAccount: owner.address,
      initialAmount: ethers.constants.MaxUint256.div(2),
    });
    tokenB = await erc20.deploy({
      name: 'tokenB',
      symbol: 'TKN1',
      decimals: 16,
      initialAccount: owner.address,
      initialAmount: ethers.constants.MaxUint256.div(2),
    });
    timeWeightedOracle = await timeWeightedOracleContract.deploy(0, 0);
    DCAGlobalParameters = await DCAGlobalParametersContract.deploy(
      owner.address,
      owner.address,
      feeRecipient.address,
      constants.NOT_ZERO_ADDRESS,
      timeWeightedOracle.address
    );
    DCAHubSwapHandler = await DCAHubSwapHandlerContract.deploy(
      tokenA.address,
      tokenB.address,
      DCAGlobalParameters.address // global parameters
    );
    await DCAHubSwapHandler.addActiveSwapInterval(SWAP_INTERVAL);
    snapshotId = await snapshot.take();
  });

  beforeEach('Deploy and configure', async () => {
    await snapshot.revert(snapshotId);
  });

  function registerSwapTest({
    title,
    tokenA,
    tokenB,
    amountToSwapTokenA,
    amountToSwapTokenB,
    nextSwapNumber,
    ratePerUnitAToB,
    ratePerUnitBToA,
    blockTimestamp,
    previous,
  }: {
    title: string;
    tokenA: () => string;
    tokenB: () => string;
    amountToSwapTokenA: BigNumberish;
    amountToSwapTokenB: BigNumberish;
    nextSwapNumber: number;
    ratePerUnitAToB: BigNumberish;
    ratePerUnitBToA: BigNumberish;
    blockTimestamp: number;
    previous?: {
      accumRatePerUnitAToB: BigNumberish;
      accumRatePerUnitBToA: BigNumberish;
    };
  }) {
    const NEXT_DELTA_FROM_A_TO_B = 20;
    const NEXT_DELTA_FROM_B_TO_A = 10;

    when(title, () => {
      given(async () => {
        await DCAHubSwapHandler.setSwapAmountDelta(tokenA(), tokenB(), SWAP_INTERVAL, nextSwapNumber, amountToSwapTokenA);
        await DCAHubSwapHandler.setSwapAmountDelta(tokenA(), tokenB(), SWAP_INTERVAL, nextSwapNumber + 1, NEXT_DELTA_FROM_A_TO_B);
        await DCAHubSwapHandler.setSwapAmountDelta(tokenB(), tokenA(), SWAP_INTERVAL, nextSwapNumber, amountToSwapTokenB);
        await DCAHubSwapHandler.setSwapAmountDelta(tokenB(), tokenA(), SWAP_INTERVAL, nextSwapNumber + 1, NEXT_DELTA_FROM_B_TO_A);
        await DCAHubSwapHandler.setPerformedSwaps(SWAP_INTERVAL, nextSwapNumber - 1);

        if (previous) {
          await DCAHubSwapHandler.setAcummRatesPerUnit(SWAP_INTERVAL, tokenA(), tokenB(), nextSwapNumber - 1, previous.accumRatePerUnitAToB);
          await DCAHubSwapHandler.setAcummRatesPerUnit(SWAP_INTERVAL, tokenB(), tokenA(), nextSwapNumber - 1, previous.accumRatePerUnitBToA);
        }

        await DCAHubSwapHandler.registerSwap(tokenA(), tokenB(), SWAP_INTERVAL, ratePerUnitAToB, ratePerUnitBToA, blockTimestamp);
      });

      describe('token A to B', () => {
        then('adds the current delta to the following one', async () => {
          const deltaInNextSwap = await DCAHubSwapHandler.swapAmountDelta(tokenA(), tokenB(), SWAP_INTERVAL, nextSwapNumber + 1);
          expect(deltaInNextSwap).to.equal(bn.toBN(amountToSwapTokenA).add(NEXT_DELTA_FROM_A_TO_B));
        });
        then('increments the rate per unit accumulator', async () => {
          const accumRatesPerUnit = await DCAHubSwapHandler.accumRatesPerUnit(SWAP_INTERVAL, tokenA(), tokenB(), nextSwapNumber);
          expect(accumRatesPerUnit).to.equal(bn.toBN(ratePerUnitAToB).add(previous?.accumRatePerUnitAToB ?? 0));
        });
        then('deletes swap amount delta of the executed swap', async () => {
          expect(await DCAHubSwapHandler.swapAmountDelta(tokenA(), tokenB(), SWAP_INTERVAL, nextSwapNumber)).to.equal(0);
        });
      });

      describe('token B to A', () => {
        then('adds the current delta to the following one', async () => {
          const deltaInNextSwap = await DCAHubSwapHandler.swapAmountDelta(tokenB(), tokenA(), SWAP_INTERVAL, nextSwapNumber + 1);
          expect(deltaInNextSwap).to.equal(bn.toBN(amountToSwapTokenB).add(NEXT_DELTA_FROM_B_TO_A));
        });
        then('increments the rate per unit accumulator', async () => {
          const accumRatesPerUnit = await DCAHubSwapHandler.accumRatesPerUnit(SWAP_INTERVAL, tokenB(), tokenA(), nextSwapNumber);
          expect(accumRatesPerUnit).to.equal(bn.toBN(ratePerUnitBToA).add(previous?.accumRatePerUnitBToA ?? 0));
        });
        then('deletes swap amount delta of the executed swap', async () => {
          expect(await DCAHubSwapHandler.swapAmountDelta(tokenB(), tokenA(), SWAP_INTERVAL, nextSwapNumber)).to.equal(0);
        });
      });

      then('performed swaps is incremented', async () => {
        expect(await DCAHubSwapHandler.performedSwaps(tokenA(), tokenB(), SWAP_INTERVAL)).to.equal(nextSwapNumber);
      });

      then('next available is updated', async () => {
        const nextTimestamp = (Math.floor(blockTimestamp / SWAP_INTERVAL) + 1) * SWAP_INTERVAL;
        expect(await DCAHubSwapHandler.nextSwapAvailable(tokenA(), tokenB(), SWAP_INTERVAL)).to.equal(nextTimestamp);
      });
    });
  }

  describe('_registerSwap', () => {
    registerSwapTest({
      title: 'it is the first swap',
      tokenA: () => tokenA.address,
      tokenB: () => tokenB.address,
      nextSwapNumber: 1,
      ratePerUnitAToB: 123456789,
      ratePerUnitBToA: 9991230,
      blockTimestamp: 1000000,
      amountToSwapTokenA: 1000000,
      amountToSwapTokenB: 5000,
    });

    registerSwapTest({
      title: 'it is not the first swap',
      tokenA: () => tokenA.address,
      tokenB: () => tokenB.address,
      nextSwapNumber: 5,
      ratePerUnitAToB: 123456789,
      ratePerUnitBToA: 9991230,
      blockTimestamp: 1000000,
      amountToSwapTokenA: 1000000,
      amountToSwapTokenB: 5000,
      previous: {
        accumRatePerUnitAToB: 100004003,
        accumRatePerUnitBToA: 600312,
      },
    });
  });

  describe('_getAmountToSwap', () => {
    when('the function is called', () => {
      const NEXT_SWAP = 1;
      const AMOUNT_TO_SWAP_TOKEN_A = BigNumber.from(100000);
      const AMOUNT_TO_SWAP_TOKEN_B = BigNumber.from(50000);

      given(async () => {
        await DCAHubSwapHandler.setSwapAmountDelta(tokenA.address, tokenB.address, SWAP_INTERVAL, NEXT_SWAP, AMOUNT_TO_SWAP_TOKEN_A);
        await DCAHubSwapHandler.setSwapAmountDelta(tokenB.address, tokenA.address, SWAP_INTERVAL, NEXT_SWAP, AMOUNT_TO_SWAP_TOKEN_B);
      });

      then('the result is whatever was stored on the delta mappings for the next swap', async () => {
        const [amountToSwapTokenA, amountToSwapTokenB] = await DCAHubSwapHandler.getAmountToSwap(tokenA.address, tokenB.address, SWAP_INTERVAL);
        expect(amountToSwapTokenA).to.equal(AMOUNT_TO_SWAP_TOKEN_A);
        expect(amountToSwapTokenB).to.equal(AMOUNT_TO_SWAP_TOKEN_B);
      });
    });
  });

  describe('_getTotalAmountsToSwap', () => {
    when('there are no swap intervals', () => {
      then('nothing is returned', async () => {
        const [amountToSwapTokenA, amountToSwapTokenB, affectedIntervals] = await DCAHubSwapHandler.getTotalAmountsToSwap(
          tokenA.address,
          tokenB.address,
          []
        );
        expect(amountToSwapTokenA).to.equal(0);
        expect(amountToSwapTokenB).to.equal(0);
        expect(affectedIntervals).to.be.empty;
      });
    });
    when('no swap interval can be swapped right now', () => {
      given(async () => {
        await DCAHubSwapHandler.setBlockTimestamp(10);
        await DCAHubSwapHandler.setNextSwapAvailable(SWAP_INTERVAL, 20);
        await DCAHubSwapHandler.setAmountToSwap(tokenA.address, tokenB.address, SWAP_INTERVAL, tokenA.asUnits(10), tokenB.asUnits(20));
      });
      then('nothing is returned', async () => {
        const [amountToSwapTokenA, amountToSwapTokenB, affectedIntervals] = await DCAHubSwapHandler.getTotalAmountsToSwap(
          tokenA.address,
          tokenB.address,
          [SWAP_INTERVAL]
        );
        expect(amountToSwapTokenA).to.equal(0);
        expect(amountToSwapTokenB).to.equal(0);
        expect(affectedIntervals).to.eql([0]);
      });
    });
    when('there is an active swap interval, but there is no amount to swap', () => {
      given(async () => {
        await DCAHubSwapHandler.setBlockTimestamp(10);
        await DCAHubSwapHandler.setNextSwapAvailable(SWAP_INTERVAL, 10);
      });
      then('nothing is returned', async () => {
        const [amountToSwapTokenA, amountToSwapTokenB, affectedIntervals] = await DCAHubSwapHandler.getTotalAmountsToSwap(
          tokenA.address,
          tokenB.address,
          [SWAP_INTERVAL]
        );
        expect(amountToSwapTokenA).to.equal(0);
        expect(amountToSwapTokenB).to.equal(0);
        expect(affectedIntervals).to.eql([0]);
      });
    });
    when('only some swap intervals are active', () => {
      given(async () => {
        await DCAHubSwapHandler.setBlockTimestamp(15);
        await DCAHubSwapHandler.setNextSwapAvailable(SWAP_INTERVAL, 20);
        await DCAHubSwapHandler.setNextSwapAvailable(SWAP_INTERVAL_2, 10);
        await DCAHubSwapHandler.setAmountToSwap(tokenA.address, tokenB.address, SWAP_INTERVAL, tokenA.asUnits(10), tokenB.asUnits(20));
        await DCAHubSwapHandler.setAmountToSwap(tokenA.address, tokenB.address, SWAP_INTERVAL_2, tokenA.asUnits(30), tokenB.asUnits(50));
      });
      then('they are returned correctly', async () => {
        const [amountToSwapTokenA, amountToSwapTokenB, affectedIntervals] = await DCAHubSwapHandler.getTotalAmountsToSwap(
          tokenA.address,
          tokenB.address,
          [SWAP_INTERVAL, SWAP_INTERVAL_2]
        );
        expect(amountToSwapTokenA).to.equal(tokenA.asUnits(30));
        expect(amountToSwapTokenB).to.equal(tokenB.asUnits(50));
        expect(affectedIntervals).to.eql([SWAP_INTERVAL_2, 0]);
      });
    });
    when('all swap intervals are active', () => {
      given(async () => {
        await DCAHubSwapHandler.setBlockTimestamp(20);
        await DCAHubSwapHandler.setNextSwapAvailable(SWAP_INTERVAL, 10);
        await DCAHubSwapHandler.setNextSwapAvailable(SWAP_INTERVAL_2, 15);
        await DCAHubSwapHandler.setAmountToSwap(tokenA.address, tokenB.address, SWAP_INTERVAL, tokenA.asUnits(10), tokenB.asUnits(20));
        await DCAHubSwapHandler.setAmountToSwap(tokenA.address, tokenB.address, SWAP_INTERVAL_2, tokenA.asUnits(30), tokenB.asUnits(50));
      });
      then('they are returned correctly', async () => {
        const [amountToSwapTokenA, amountToSwapTokenB, affectedIntervals] = await DCAHubSwapHandler.getTotalAmountsToSwap(
          tokenA.address,
          tokenB.address,
          [SWAP_INTERVAL, SWAP_INTERVAL_2]
        );
        expect(amountToSwapTokenA).to.equal(tokenA.asUnits(40));
        expect(amountToSwapTokenB).to.equal(tokenB.asUnits(70));
        expect(affectedIntervals).to.eql([SWAP_INTERVAL, SWAP_INTERVAL_2]);
      });
    });
  });

  describe('_calculateRatio', () => {
    when('function is called', () => {
      let ratioAToB: BigNumber, ratioAToBWithFee: BigNumber;
      let ratioBToA: BigNumber, ratioBToAWithFee: BigNumber;
      given(async () => {
        await setOracleData({ ratePerUnitBToA: tokenA.asUnits(0.6) });
        [ratioAToB, ratioBToA, ratioAToBWithFee, ratioBToAWithFee] = await DCAHubSwapHandler.calculateRatio(
          tokenA.address,
          tokenB.address,
          tokenA.magnitude,
          tokenB.magnitude,
          6000,
          timeWeightedOracle.address
        );
      });
      then('ratios are calculated correctly', () => {
        const expectedRatioBToA = tokenA.asUnits(0.6);
        expect(ratioAToB).to.equal(tokenA.magnitude.mul(tokenB.magnitude).div(expectedRatioBToA));
        expect(ratioBToA).to.equal(expectedRatioBToA);
      });
      then('ratios with fee are also calculated correctly', () => {
        expect(ratioAToBWithFee).to.equal(APPLY_FEE(ratioAToB));
        expect(ratioBToAWithFee).to.equal(APPLY_FEE(ratioBToA));
      });
    });
  });

  describe('_getNextSwapInfo', () => {
    let tokenC: TokenContract;

    given(async () => {
      tokenC = await erc20.deploy({
        name: 'tokenC',
        symbol: 'TKN2',
        decimals: 18,
        initialAccount: owner.address,
        initialAmount: ethers.constants.MaxUint256.div(2),
      });
    });

    type Pair = {
      tokenA: () => TokenContract;
      tokenB: () => TokenContract;
      amountTokenA: number;
      amountTokenB: number;
      ratioBToA: number;
    };

    type Token = { token: () => TokenContract } & ({ CoW: number } | { platformFee: number }) & ({ required: number } | { reward: number } | {});

    type RatiosWithFee = { ratioAToBWithFee: BigNumber; ratioBToAWithFee: BigNumber };

    function internalGetNextSwapInfoTest({ title, pairs, result }: { title: string; pairs: Pair[]; result: Token[] }) {
      when(title, () => {
        let expectedRatios: Map<string, { ratioAToB: BigNumber; ratioBToA: BigNumber }>;
        let swapInformation: SwapInformation;
        let ratiosWithFees: RatiosWithFee[];

        given(async () => {
          expectedRatios = new Map();
          for (const { tokenA, tokenB, amountTokenA, amountTokenB, ratioBToA } of pairs) {
            const [token0, token1, amountToken0, amountToken1, ratio1To0] =
              tokenA().address < tokenB().address
                ? [tokenA(), tokenB(), amountTokenA, amountTokenB, ratioBToA]
                : [tokenB(), tokenA(), amountTokenB, amountTokenA, 1 / ratioBToA];
            await DCAHubSwapHandler.setTotalAmountsToSwap(
              token0.address,
              token1.address,
              token0.asUnits(amountToken0),
              token1.asUnits(amountToken1)
            );
            await DCAHubSwapHandler.setRatio(token0.address, token1.address, token0.asUnits(ratio1To0));
            expectedRatios.set(token0.address + token1.address, {
              ratioBToA: token0.asUnits(ratio1To0),
              ratioAToB: token1.asUnits(1 / ratio1To0),
            });
          }
          const { tokens, indexes } = buildSwapInput(
            pairs.map(({ tokenA, tokenB }) => ({ tokenA: tokenA().address, tokenB: tokenB().address }))
          );
          [swapInformation, ratiosWithFees] = await DCAHubSwapHandler.internalGetNextSwapInfo(
            tokens,
            indexes,
            6000,
            timeWeightedOracle.address,
            [SWAP_INTERVAL, SWAP_INTERVAL_2]
          );
        });

        then('ratios are expose correctly', () => {
          for (const pair of swapInformation.pairs) {
            const { ratioAToB, ratioBToA } = expectedRatios.get(pair.tokenA + pair.tokenB)!;
            expect(pair.ratioAToB).to.equal(ratioAToB);
            expect(pair.ratioBToA).to.equal(ratioBToA);
          }
        });

        then('ratios with fees are expose correctly', () => {
          for (let i = 0; i < ratiosWithFees.length; i++) {
            const { tokenA, tokenB } = swapInformation.pairs[i];
            const { ratioAToBWithFee, ratioBToAWithFee } = ratiosWithFees[i];
            const { ratioAToB, ratioBToA } = expectedRatios.get(tokenA + tokenB)!;
            expect(ratioAToBWithFee).to.equal(APPLY_FEE(ratioAToB));
            expect(ratioBToAWithFee).to.equal(APPLY_FEE(ratioBToA));
          }
        });

        then('intervals are expose correctly', () => {
          for (const pair of swapInformation.pairs) {
            expect(pair.intervalsInSwap).to.eql([SWAP_INTERVAL, SWAP_INTERVAL_2]);
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

    internalGetNextSwapInfoTest({
      title: 'no pairs are sent',
      pairs: [],
      result: [],
    });

    internalGetNextSwapInfoTest({
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

    internalGetNextSwapInfoTest({
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

    internalGetNextSwapInfoTest({
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

    internalGetNextSwapInfoTest({
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

    internalGetNextSwapInfoTest({
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

    internalGetNextSwapInfoTest({
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

    internalGetNextSwapInfoTest({
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

    internalGetNextSwapInfoTest({
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
  });

  describe('getNextSwapInfo', () => {
    type NextSwapInfo = {
      tokens: {
        token: string;
        reward: BigNumber;
        toProvide: BigNumber;
        availableToBorrow: BigNumber;
      }[];
      pairs: SwapInformation['pairs'];
    };

    when('getNextSwapInfo is called', () => {
      const INTERNAL_BALANCE_TOKEN_A = BigNumber.from(100);
      const INTERNAL_BALANCE_TOKEN_B = BigNumber.from(200);

      let internalSwapInformation: SwapInformation;
      let result: NextSwapInfo;

      given(async () => {
        internalSwapInformation = {
          tokens: [
            {
              token: tokenA.address,
              reward: constants.ZERO,
              toProvide: BigNumber.from(20),
              platformFee: constants.ZERO,
            },
            {
              token: tokenB.address,
              reward: BigNumber.from(20),
              toProvide: constants.ZERO,
              platformFee: BigNumber.from(50),
            },
          ],
          pairs: [
            {
              tokenA: tokenA.address,
              tokenB: tokenB.address,
              ratioAToB: BigNumber.from(10),
              ratioBToA: BigNumber.from(10),
              intervalsInSwap: [SWAP_INTERVAL, SWAP_INTERVAL_2],
            },
          ],
        };

        await DCAHubSwapHandler.setInternalBalance(tokenA.address, INTERNAL_BALANCE_TOKEN_A);
        await DCAHubSwapHandler.setInternalBalance(tokenB.address, INTERNAL_BALANCE_TOKEN_B);
        await DCAHubSwapHandler.setInternalGetNextSwapInfo(internalSwapInformation, []);
        // @ts-ignore
        result = (
          await DCAHubSwapHandler.functions['getNextSwapInfo(address[],(uint8,uint8)[])'](
            [tokenA.address, tokenB.address],
            [{ indexTokenA: 0, indexTokenB: 1 }]
          )
        )._swapInformation;
      });

      then('_getNextSwapInfo is called with the correct parameters', () => {
        // TODO: We can't do this right now, because _getNextSwapInfo is a view, so we can't store the call in the contract's state.
        // We will need to wait for smock to support it
      });

      then('pairs are returned correctly', () => {
        expect(result.pairs.length).to.equal(1);
        const [pair] = result.pairs;
        const [expectedPair] = internalSwapInformation.pairs;
        expect(pair.tokenA).to.eql(expectedPair.tokenA);
        expect(pair.tokenB).to.eql(expectedPair.tokenB);
        expect(pair.ratioAToB).to.eql(expectedPair.ratioAToB);
        expect(pair.ratioBToA).to.eql(expectedPair.ratioBToA);
        expect(pair.intervalsInSwap).to.eql(expectedPair.intervalsInSwap);
      });

      then('tokens are returned correctly', () => {
        for (let i = 0; i < result.tokens.length; i++) {
          const token = result.tokens[i];
          const internalTokenInfo = internalSwapInformation.tokens[i];
          expect(token.token).to.equal(internalTokenInfo.token);
          expect(token.toProvide).to.equal(internalTokenInfo.toProvide);
          expect(token.reward).to.equal(internalTokenInfo.reward);
          const balance = token.token === tokenA.address ? INTERNAL_BALANCE_TOKEN_A : INTERNAL_BALANCE_TOKEN_B;
          expect(token.availableToBorrow).to.equal(balance.sub(internalTokenInfo.reward));
        }
      });
    });
  });

  const setOracleData = async ({ ratePerUnitBToA }: { ratePerUnitBToA: BigNumber }) => {
    await timeWeightedOracle.setRate(ratePerUnitBToA, tokenB.amountOfDecimals);
  };

  type NextSwapInformationContext = {
    interval: number;
    nextSwapToPerform: number;
    amountToSwapOfTokenA: number;
    amountToSwapOfTokenB: number;
  };

  type NextSwapInformationContextWithNextSwapAvailableAt = NextSwapInformationContext & { nextSwapAvailableAt?: number };

  const setNextSwapInfoContext = async ({
    nextSwapInfo,
    blockTimestamp,
  }: {
    nextSwapInfo: NextSwapInformationContextWithNextSwapAvailableAt[];
    blockTimestamp: number;
  }) => {
    for (let i = 0; i < nextSwapInfo.length; i++) {
      const nextSwapToPerform = bn.toBN(nextSwapInfo[i].nextSwapToPerform);
      const amountToSwapOfTokenA = toBN(nextSwapInfo[i].amountToSwapOfTokenA, tokenA);
      const amountToSwapOfTokenB = toBN(nextSwapInfo[i].amountToSwapOfTokenB, tokenB);
      await DCAHubSwapHandler.setNextSwapAvailable(nextSwapInfo[i].interval, nextSwapInfo[i].nextSwapAvailableAt ?? blockTimestamp);
      await DCAHubSwapHandler.setPerformedSwaps(nextSwapInfo[i].interval, nextSwapToPerform.sub(1));
      await DCAHubSwapHandler.setSwapAmountDelta(
        tokenA.address,
        tokenB.address,
        nextSwapInfo[i].interval,
        nextSwapToPerform,
        amountToSwapOfTokenA
      );
      await DCAHubSwapHandler.setSwapAmountDelta(
        tokenB.address,
        tokenA.address,
        nextSwapInfo[i].interval,
        nextSwapToPerform,
        amountToSwapOfTokenB
      );
    }
  };

  type NextSwapInfo = {
    swapsToPerform: ([number, number, BigNumber, BigNumber] & {
      interval: number;
      swapToPerform: number;
      amountToSwapTokenA: BigNumber;
      amountToSwapTokenB: BigNumber;
    })[];
    amountOfSwaps: number;
    availableToBorrowTokenA: BigNumber;
    availableToBorrowTokenB: BigNumber;
    ratePerUnitBToA: BigNumber;
    ratePerUnitAToB: BigNumber;
    platformFeeTokenA: BigNumber;
    platformFeeTokenB: BigNumber;
    amountToBeProvidedBySwapper: BigNumber;
    amountToRewardSwapperWith: BigNumber;
    tokenToBeProvidedBySwapper: string;
    tokenToRewardSwapperWith: string;
  };

  function parseNextSwaps(nextSwapContext: NextSwapInformationContext[], blockTimestamp?: number) {
    const parsedNextSwaps = nextSwapContext
      .filter((nextSwap) => doesSwapNeedToBeExecuted(nextSwap, blockTimestamp))
      .map(({ interval, nextSwapToPerform, amountToSwapOfTokenA, amountToSwapOfTokenB }) => [
        interval,
        nextSwapToPerform,
        toBN(amountToSwapOfTokenA, tokenA),
        toBN(amountToSwapOfTokenB, tokenB),
      ]);
    const fill = new Array(nextSwapContext.length - parsedNextSwaps.length).fill([0, 0, constants.ZERO, constants.ZERO]);
    return { nextSwaps: parsedNextSwaps.concat(fill), amount: parsedNextSwaps.length };
  }

  function getNextSwapsToPerformTest({
    title,
    context,
    blockTimestamp,
    nextSwapContext,
  }: {
    title: string;
    context?: () => Promise<any>;
    blockTimestamp?: number;
    nextSwapContext: NextSwapInformationContextWithNextSwapAvailableAt[];
  }) {
    when(title, async () => {
      let nextSwapsToPerform: any[];
      let parsedNextSwaps: any[];
      given(async () => {
        if (context) {
          await context();
        }
        blockTimestamp = blockTimestamp ?? moment().unix();
        await DCAHubSwapHandler.setBlockTimestamp(blockTimestamp);
        await setNextSwapInfoContext({
          nextSwapInfo: nextSwapContext,
          blockTimestamp,
        });
        ({ nextSwaps: parsedNextSwaps } = parseNextSwaps(nextSwapContext, blockTimestamp));
        nextSwapsToPerform = (await DCAHubSwapHandler.getNextSwapsToPerform())[0];
      });
      then('only intervals being executed are non zero', () => {
        for (let i = 0; i < nextSwapsToPerform.length; i++) {
          expect(nextSwapsToPerform[i][0]).to.equal(parsedNextSwaps[i][0]);
        }
      });
      then('swaps to perform are correct', () => {
        for (let i = 0; i < nextSwapsToPerform.length; i++) {
          expect(nextSwapsToPerform[i][1]).to.equal(parsedNextSwaps[i][1]);
        }
      });
      then('amounts to swap of token a are correct', () => {
        for (let i = 0; i < nextSwapsToPerform.length; i++) {
          expect(nextSwapsToPerform[i][2]).to.equal(parsedNextSwaps[i][2]);
        }
      });
      then('amounts to swap of token b are correct', () => {
        for (let i = 0; i < nextSwapsToPerform.length; i++) {
          expect(nextSwapsToPerform[i][3]).to.equal(parsedNextSwaps[i][3]);
        }
      });
    });
  }

  describe('getNextSwapsToPerform', () => {
    getNextSwapsToPerformTest({
      title: 'no active swap interval',
      context: () => DCAHubSwapHandler.removeActiveSwapInterval(SWAP_INTERVAL),
      nextSwapContext: [],
    });

    getNextSwapsToPerformTest({
      title: 'active swap interval as 0 amount',
      nextSwapContext: [
        {
          interval: SWAP_INTERVAL,
          nextSwapToPerform: 5,
          amountToSwapOfTokenA: 0,
          amountToSwapOfTokenB: 0,
        },
      ],
    });

    getNextSwapsToPerformTest({
      title: 'active swap interval is not executable',
      nextSwapContext: [
        {
          interval: SWAP_INTERVAL,
          nextSwapToPerform: 5,
          nextSwapAvailableAt: 10000 + 1,
          amountToSwapOfTokenA: 100,
          amountToSwapOfTokenB: 200,
        },
      ],
      blockTimestamp: 10000,
    });

    getNextSwapsToPerformTest({
      title: 'active swap interval is executable',
      nextSwapContext: [
        {
          interval: SWAP_INTERVAL,
          nextSwapToPerform: 5,
          amountToSwapOfTokenA: 100,
          amountToSwapOfTokenB: 200,
        },
      ],
    });

    getNextSwapsToPerformTest({
      title: 'neither of both intervals are executable',
      context: () => DCAHubSwapHandler.addActiveSwapInterval(SWAP_INTERVAL_2),
      nextSwapContext: [
        {
          interval: SWAP_INTERVAL,
          nextSwapToPerform: 5,
          nextSwapAvailableAt: 10000 + 1,
          amountToSwapOfTokenA: 100,
          amountToSwapOfTokenB: 200,
        },
        {
          interval: SWAP_INTERVAL_2,
          nextSwapToPerform: 105,
          nextSwapAvailableAt: 10000 + 1,
          amountToSwapOfTokenA: 100,
          amountToSwapOfTokenB: 200,
        },
      ],
      blockTimestamp: 10000,
    });

    getNextSwapsToPerformTest({
      title: 'one of both intervals is executable',
      context: () => DCAHubSwapHandler.addActiveSwapInterval(SWAP_INTERVAL_2),
      nextSwapContext: [
        {
          interval: SWAP_INTERVAL,
          nextSwapToPerform: 5,
          amountToSwapOfTokenA: 100,
          amountToSwapOfTokenB: 200,
        },
        {
          interval: SWAP_INTERVAL_2,
          nextSwapToPerform: 105,
          nextSwapAvailableAt: 10000 + 1,
          amountToSwapOfTokenA: 100,
          amountToSwapOfTokenB: 200,
        },
      ],
      blockTimestamp: 10000,
    });

    getNextSwapsToPerformTest({
      title: 'both intervals are executable',
      context: () => DCAHubSwapHandler.addActiveSwapInterval(SWAP_INTERVAL_2),
      nextSwapContext: [
        {
          interval: SWAP_INTERVAL,
          nextSwapToPerform: 5,
          amountToSwapOfTokenA: 100,
          amountToSwapOfTokenB: 200,
        },
        {
          interval: SWAP_INTERVAL_2,
          nextSwapToPerform: 105,
          amountToSwapOfTokenA: 100,
          amountToSwapOfTokenB: 200,
        },
      ],
    });
  });

  function doesSwapNeedToBeExecuted(nextSwapContext: NextSwapInformationContextWithNextSwapAvailableAt, blockTimestamp?: number): boolean {
    return !blockTimestamp || !nextSwapContext.nextSwapAvailableAt || nextSwapContext.nextSwapAvailableAt <= blockTimestamp;
  }

  function getNextSwapInfoTest({
    title,
    context,
    nextSwapContext,
    ratePerUnitBToA,
    threshold,
  }: {
    title: string;
    context?: () => Promise<any>;
    nextSwapContext: NextSwapInformationContext[];
    ratePerUnitBToA: BigNumber | number | string;
    threshold?: BigNumber | number;
  }) {
    let totalAmountToSwapOfTokenA: BigNumber;
    let totalAmountToSwapOfTokenB: BigNumber;
    let ratePerUnitAToB: BigNumber;
    let platformFeeTokenA: BigNumber;
    let platformFeeTokenB: BigNumber;
    let amountToBeProvidedBySwapper: BigNumber;
    let amountToRewardSwapperWith: BigNumber;
    let tokenToBeProvidedBySwapper: () => string;
    let tokenToRewardSwapperWith: () => string;
    let nextSwapInfo: NextSwapInfo;
    when(title, () => {
      given(async () => {
        if (context) await context();
        totalAmountToSwapOfTokenA = toBN(
          sumAmountFromContext(nextSwapContext, (swapContext) => swapContext.amountToSwapOfTokenA),
          tokenA
        );
        totalAmountToSwapOfTokenB = toBN(
          sumAmountFromContext(nextSwapContext, (swapContext) => swapContext.amountToSwapOfTokenB),
          tokenB
        );
        ratePerUnitBToA = toBN(ratePerUnitBToA, tokenA);
        threshold = bn.toBN(threshold ?? 1);
        ({
          ratePerUnitAToB,
          platformFeeTokenA,
          platformFeeTokenB,
          amountToBeProvidedBySwapper,
          amountToRewardSwapperWith,
          tokenToBeProvidedBySwapper,
          tokenToRewardSwapperWith,
        } = calculateSwapDetails(ratePerUnitBToA, totalAmountToSwapOfTokenB, totalAmountToSwapOfTokenA));
        await DCAHubSwapHandler.setNextSwapsToPerform(
          nextSwapContext.map(({ interval, nextSwapToPerform, amountToSwapOfTokenA, amountToSwapOfTokenB }) => ({
            interval,
            swapToPerform: nextSwapToPerform,
            amountToSwapTokenA: tokenA.asUnits(amountToSwapOfTokenA),
            amountToSwapTokenB: tokenB.asUnits(amountToSwapOfTokenB),
          }))
        );
        await setOracleData({ ratePerUnitBToA });
        await DCAHubSwapHandler.setInternalBalances(
          (totalAmountToSwapOfTokenA as BigNumber).mul(2),
          (totalAmountToSwapOfTokenB as BigNumber).mul(2)
        );
        nextSwapInfo = await DCAHubSwapHandler['getNextSwapInfo()']();
      });
      then('swaps to perform are correct', () => {
        const parsedNextSwaps = parseNextSwaps(nextSwapContext);
        expect(nextSwapInfo.swapsToPerform).to.eql(parsedNextSwaps.nextSwaps);
        expect(nextSwapInfo.amountOfSwaps).to.eql(parsedNextSwaps.amount);
      });
      then('rate of unit b to a is correct', async () => {
        bn.expectToEqualWithThreshold({
          value: nextSwapInfo.ratePerUnitBToA,
          to: ratePerUnitBToA,
          threshold: threshold!,
        });
      });
      then('rate of unit a to b is correct', () => {
        bn.expectToEqualWithThreshold({
          value: nextSwapInfo.ratePerUnitAToB,
          to: ratePerUnitAToB,
          threshold: threshold!,
        });
      });
      then('token a fee is correct', async () => {
        bn.expectToEqualWithThreshold({
          value: nextSwapInfo.platformFeeTokenA,
          to: platformFeeTokenA,
          threshold: threshold!,
        });
      });
      then('token b fee is correct', async () => {
        bn.expectToEqualWithThreshold({
          value: nextSwapInfo.platformFeeTokenB,
          to: platformFeeTokenB,
          threshold: threshold!,
        });
      });
      then('the amount of tokens to be provided by swapper is correct', async () => {
        bn.expectToEqualWithThreshold({
          value: nextSwapInfo.amountToBeProvidedBySwapper,
          to: amountToBeProvidedBySwapper,
          threshold: threshold!,
        });
      });
      then('the amount of tokens to reward swapper with is correct', async () => {
        bn.expectToEqualWithThreshold({
          value: nextSwapInfo.amountToRewardSwapperWith,
          to: amountToRewardSwapperWith,
          threshold: threshold!,
        });
      });
      then('token to be provided by swapper is correct', async () => {
        expect(nextSwapInfo.tokenToBeProvidedBySwapper).to.be.equal(tokenToBeProvidedBySwapper());
      });
      then('token to reward swapper with is correct', async () => {
        expect(nextSwapInfo.tokenToRewardSwapperWith).to.be.equal(tokenToRewardSwapperWith());
      });
      then('available to borrow token a is correct', async () => {
        const balanceA = await DCAHubSwapHandler.internalBalanceOf(tokenA.address);
        if (tokenToRewardSwapperWith() === tokenA.address) {
          expect(nextSwapInfo.availableToBorrowTokenA).to.be.equal(balanceA.sub(nextSwapInfo.amountToRewardSwapperWith));
        } else {
          expect(nextSwapInfo.availableToBorrowTokenA).to.be.equal(balanceA);
        }
      });
      then('available to borrow token b is correct', async () => {
        const balanceB = await DCAHubSwapHandler.internalBalanceOf(tokenB.address);
        if (tokenToRewardSwapperWith() === tokenB.address) {
          expect(nextSwapInfo.availableToBorrowTokenB).to.be.equal(balanceB.sub(nextSwapInfo.amountToRewardSwapperWith));
        } else {
          expect(nextSwapInfo.availableToBorrowTokenB).to.be.equal(balanceB);
        }
      });
      then('fees are no more than expected', () => {
        const expectedFeesTokenA = CALCULATE_FEE(totalAmountToSwapOfTokenA as BigNumber);
        const expectedFeesTokenB = CALCULATE_FEE(totalAmountToSwapOfTokenB as BigNumber);

        let totalFeesTokenA = platformFeeTokenA;
        let totalFeesTokenB = platformFeeTokenB;

        if (tokenToRewardSwapperWith() === tokenA.address) {
          const feesAsRewards = amountToRewardSwapperWith.sub(amountToBeProvidedBySwapper.mul(ratePerUnitBToA).div(tokenB.magnitude));
          totalFeesTokenA = totalFeesTokenA.add(feesAsRewards);
        } else {
          const feesAsRewards = amountToRewardSwapperWith.sub(amountToBeProvidedBySwapper.mul(ratePerUnitAToB).div(tokenA.magnitude));
          totalFeesTokenB = totalFeesTokenB.add(feesAsRewards);
        }
        bn.expectToEqualWithThreshold({
          value: totalFeesTokenA,
          to: expectedFeesTokenA,
          threshold: threshold!,
        });
        bn.expectToEqualWithThreshold({
          value: totalFeesTokenB,
          to: expectedFeesTokenB,
          threshold: threshold!,
        });
      });
    });
  }

  describe('getNextSwapInfo', () => {
    getNextSwapInfoTest({
      title: 'only one interval, rate per unit is 1:1 and needing token b to be provided externally',
      nextSwapContext: [
        {
          interval: SWAP_INTERVAL,
          nextSwapToPerform: 2,
          amountToSwapOfTokenA: 1.4,
          amountToSwapOfTokenB: 1.3,
        },
      ],
      ratePerUnitBToA: 1,
    });

    getNextSwapInfoTest({
      title: 'only one interval but no amount to swap',
      nextSwapContext: [
        {
          interval: SWAP_INTERVAL,
          nextSwapToPerform: 2,
          amountToSwapOfTokenA: 0,
          amountToSwapOfTokenB: 0,
        },
      ],
      ratePerUnitBToA: 1,
    });

    getNextSwapInfoTest({
      title: 'only one interval, rate per unit is 1:1 and needing token a to be provided externally',
      nextSwapContext: [
        {
          interval: SWAP_INTERVAL,
          nextSwapToPerform: 2,
          amountToSwapOfTokenA: 1,
          amountToSwapOfTokenB: 1.3,
        },
      ],
      ratePerUnitBToA: 1,
    });

    getNextSwapInfoTest({
      title: 'only one interval, rate per unit is 1:1 and there is no need to provide tokens externally',
      nextSwapContext: [
        {
          interval: SWAP_INTERVAL,
          nextSwapToPerform: 2,
          amountToSwapOfTokenA: 1,
          amountToSwapOfTokenB: 1,
        },
      ],
      ratePerUnitBToA: 1,
    });

    getNextSwapInfoTest({
      title: 'only one interval, rate per unit is 3:5 and needing token b to be provided externally',
      nextSwapContext: [
        {
          interval: SWAP_INTERVAL,
          nextSwapToPerform: 2,
          amountToSwapOfTokenA: 1.4,
          amountToSwapOfTokenB: 2,
        },
      ],
      ratePerUnitBToA: 0.6,
      threshold: 2,
    });

    getNextSwapInfoTest({
      title: 'only one interval, rate per unit is 3:5 and needing token a to be provided externally',
      nextSwapContext: [
        {
          interval: SWAP_INTERVAL,
          nextSwapToPerform: 2,
          amountToSwapOfTokenA: 1,
          amountToSwapOfTokenB: 5,
        },
      ],
      threshold: 2,
      ratePerUnitBToA: 0.6,
    });

    getNextSwapInfoTest({
      title: 'two intervals, rate per unit is 1:2 and needing token b to be provided externally',
      context: () => DCAHubSwapHandler.addActiveSwapInterval(SWAP_INTERVAL_2),
      nextSwapContext: [
        {
          interval: SWAP_INTERVAL,
          nextSwapToPerform: 2,
          amountToSwapOfTokenA: 1.4,
          amountToSwapOfTokenB: 2.6,
        },
        {
          interval: SWAP_INTERVAL_2,
          nextSwapToPerform: 8,
          amountToSwapOfTokenA: 1.4,
          amountToSwapOfTokenB: 2.8,
        },
      ],
      ratePerUnitBToA: 0.5,
    });

    getNextSwapInfoTest({
      title: 'two intervals, rate per unit is 1:2 and needing token a to be provided externally',
      context: () => DCAHubSwapHandler.addActiveSwapInterval(SWAP_INTERVAL_2),
      nextSwapContext: [
        {
          interval: SWAP_INTERVAL,
          nextSwapToPerform: 3,
          amountToSwapOfTokenA: 1,
          amountToSwapOfTokenB: 2.6,
        },
        {
          interval: SWAP_INTERVAL_2,
          nextSwapToPerform: 7,
          amountToSwapOfTokenA: 0.3,
          amountToSwapOfTokenB: 1,
        },
      ],
      ratePerUnitBToA: 0.5,
    });

    getNextSwapInfoTest({
      title: 'two intervals, rate per unit is 1:2 and there is no need to provide tokens externally',
      context: () => DCAHubSwapHandler.addActiveSwapInterval(SWAP_INTERVAL_2),
      nextSwapContext: [
        {
          interval: SWAP_INTERVAL,
          nextSwapToPerform: 2,
          amountToSwapOfTokenA: 1,
          amountToSwapOfTokenB: 2,
        },
        {
          interval: SWAP_INTERVAL_2,
          nextSwapToPerform: 15,
          amountToSwapOfTokenA: 0.5,
          amountToSwapOfTokenB: 1,
        },
      ],
      ratePerUnitBToA: 0.5,
    });
  });

  const swapTestFailed = ({
    title,
    context,
    nextSwapContext,
    addedSwapIntervals,
    blockTimestamp,
    initialSwapperBalanceTokenA,
    initialSwapperBalanceTokenB,
    ratePerUnitBToA,
    initialPairBalanceTokenA,
    initialPairBalanceTokenB,
    reason,
  }: {
    title: string;
    context?: () => Promise<any>;
    nextSwapContext: NextSwapInformationContext[];
    addedSwapIntervals?: number[];
    blockTimestamp?: number;
    initialSwapperBalanceTokenA: BigNumber | number | string | (() => BigNumber | number | string);
    initialSwapperBalanceTokenB: BigNumber | number | string | (() => BigNumber | number | string);
    ratePerUnitBToA: BigNumber | number | string;
    initialPairBalanceTokenA?: BigNumber | number | string;
    initialPairBalanceTokenB?: BigNumber | number | string;
    reason: string;
  }) => {
    let totalAmountToSwapOfTokenA: BigNumber;
    let totalAmountToSwapOfTokenB: BigNumber;
    when(title, () => {
      let swapper: Wallet;
      let swapTx: Promise<TransactionResponse>;
      given(async () => {
        if (context) {
          await context();
        }
        for (const interval of addedSwapIntervals ?? []) {
          await DCAHubSwapHandler.addActiveSwapInterval(interval);
        }
        initialSwapperBalanceTokenA =
          typeof initialSwapperBalanceTokenA === 'function' ? initialSwapperBalanceTokenA() : initialSwapperBalanceTokenA;
        initialSwapperBalanceTokenB =
          typeof initialSwapperBalanceTokenB === 'function' ? initialSwapperBalanceTokenB() : initialSwapperBalanceTokenB;
        initialSwapperBalanceTokenA = toBN(initialSwapperBalanceTokenA, tokenA);
        initialSwapperBalanceTokenB = toBN(initialSwapperBalanceTokenB, tokenB);
        totalAmountToSwapOfTokenA = toBN(
          sumAmountFromContext(nextSwapContext, (swapContext) => swapContext.amountToSwapOfTokenA),
          tokenA
        );
        totalAmountToSwapOfTokenB = toBN(
          sumAmountFromContext(nextSwapContext, (swapContext) => swapContext.amountToSwapOfTokenB),
          tokenB
        );
        initialPairBalanceTokenA = initialPairBalanceTokenA !== undefined ? toBN(initialPairBalanceTokenA, tokenA) : totalAmountToSwapOfTokenA;
        initialPairBalanceTokenB = initialPairBalanceTokenB !== undefined ? toBN(initialPairBalanceTokenB, tokenB) : totalAmountToSwapOfTokenB;
        ratePerUnitBToA = toBN(ratePerUnitBToA, tokenA);
        blockTimestamp = blockTimestamp ?? moment().unix();
        await DCAHubSwapHandler.setBlockTimestamp(blockTimestamp);
        swapper = await (await wallet.generateRandom()).connect(ethers.provider);

        await DCAHubSwapHandler.setNextSwapsToPerform(
          nextSwapContext.map(({ interval, nextSwapToPerform, amountToSwapOfTokenA, amountToSwapOfTokenB }) => ({
            interval,
            swapToPerform: nextSwapToPerform,
            amountToSwapTokenA: tokenA.asUnits(amountToSwapOfTokenA),
            amountToSwapTokenB: tokenB.asUnits(amountToSwapOfTokenB),
          }))
        );
        await setOracleData({ ratePerUnitBToA });

        await tokenA.transfer(swapper.address, initialSwapperBalanceTokenA);
        await tokenB.transfer(swapper.address, initialSwapperBalanceTokenB);
        await tokenA.mint(DCAHubSwapHandler.address, initialPairBalanceTokenA);
        await tokenB.mint(DCAHubSwapHandler.address, initialPairBalanceTokenB);
        await DCAHubSwapHandler.setInternalBalances(initialPairBalanceTokenA, initialPairBalanceTokenB);
        swapTx = DCAHubSwapHandler.connect(swapper)['swap()']();
        await behaviours.waitForTxAndNotThrow(swapTx);
      });

      then('tx is reverted with reason', async () => {
        await expect(swapTx).to.be.revertedWith(reason);
      });
      then('swapper balance of token A remains the same', async () => {
        expect(await tokenA.balanceOf(await swapper.getAddress())).to.equal(initialSwapperBalanceTokenA);
      });
      then('swapper balance of token B remains the same', async () => {
        expect(await tokenB.balanceOf(await swapper.getAddress())).to.equal(initialSwapperBalanceTokenB);
      });
      then('pair balance of token A remains the same', async () => {
        expect(await tokenA.balanceOf(DCAHubSwapHandler.address)).to.equal(initialPairBalanceTokenA);
      });
      then('pair balance of token B remains the same', async () => {
        expect(await tokenB.balanceOf(DCAHubSwapHandler.address)).to.equal(initialPairBalanceTokenB);
      });
      then('swap was not registered on token a', async () => {
        for (let i = 0; i < nextSwapContext.length; i++) {
          expect(
            await DCAHubSwapHandler.swapAmountDelta(
              tokenA.address,
              tokenB.address,
              nextSwapContext[i].interval,
              nextSwapContext[i].nextSwapToPerform
            )
          ).to.be.equal(0);
        }
      });
      then('swap was not registered on token b', async () => {
        for (let i = 0; i < nextSwapContext.length; i++) {
          expect(
            await DCAHubSwapHandler.swapAmountDelta(
              tokenB.address,
              tokenA.address,
              nextSwapContext[i].interval,
              nextSwapContext[i].nextSwapToPerform
            )
          ).to.be.equal(0);
        }
      });
      then('next swap available did not increase', async () => {
        for (let i = 0; i < nextSwapContext.length; i++) {
          expect(await DCAHubSwapHandler.nextSwapAvailable(tokenA.address, tokenB.address, nextSwapContext[i].interval)).to.equal(0);
        }
      });
      then('performed swaps did not increase', async () => {
        for (let i = 0; i < nextSwapContext.length; i++) {
          expect(await DCAHubSwapHandler.performedSwaps(tokenA.address, tokenB.address, nextSwapContext[i].interval)).to.equal(0);
        }
      });
      then('active swap intervals remain the same', async () => {
        expect(await DCAHubSwapHandler.isSwapIntervalActive(SWAP_INTERVAL)).to.true;
        for (const addedSwapInterval of addedSwapIntervals ?? []) {
          expect(await DCAHubSwapHandler.isSwapIntervalActive(addedSwapInterval)).to.true;
        }
      });
      thenInternalBalancesAreTheSameAsTokenBalances();
    });
  };

  describe('swap', () => {
    swapTestFailed({
      title: 'there are no swaps to execute',
      nextSwapContext: [],
      initialSwapperBalanceTokenA: 0,
      initialSwapperBalanceTokenB: 0,
      ratePerUnitBToA: 1,
      reason: 'NoSwapsToExecute',
    });

    swapTestFailed({
      title: 'external amount of token a to be provided is not sent',
      addedSwapIntervals: [SWAP_INTERVAL_2],
      nextSwapContext: [
        {
          interval: SWAP_INTERVAL,
          nextSwapToPerform: 2,
          amountToSwapOfTokenA: 0.5,
          amountToSwapOfTokenB: 2,
        },
        {
          interval: SWAP_INTERVAL_2,
          nextSwapToPerform: 5,
          amountToSwapOfTokenA: 0.5,
          amountToSwapOfTokenB: 0,
        },
      ],
      initialSwapperBalanceTokenA: () => tokenA.asUnits(1).sub(1),
      initialSwapperBalanceTokenB: 0,
      ratePerUnitBToA: 1,
      reason: 'LiquidityNotReturned',
    });

    swapTestFailed({
      title: 'external amount of token b to be provided is not sent',
      addedSwapIntervals: [SWAP_INTERVAL_2],
      nextSwapContext: [
        {
          interval: SWAP_INTERVAL,
          nextSwapToPerform: 2,
          amountToSwapOfTokenA: 0,
          amountToSwapOfTokenB: 1,
        },
        {
          interval: SWAP_INTERVAL_2,
          nextSwapToPerform: 12,
          amountToSwapOfTokenA: 1.1,
          amountToSwapOfTokenB: 0,
        },
      ],
      initialSwapperBalanceTokenA: 0,
      initialSwapperBalanceTokenB: () => tokenB.asUnits(1).sub(1),
      ratePerUnitBToA: 1,
      reason: 'LiquidityNotReturned',
    });

    swapTestFailed({
      title: 'pair swap handler does not own the amount of token to reward swapper with',
      nextSwapContext: [
        {
          interval: SWAP_INTERVAL,
          nextSwapToPerform: 2,
          amountToSwapOfTokenA: 2,
          amountToSwapOfTokenB: 1,
        },
      ],
      initialSwapperBalanceTokenA: 0,
      initialSwapperBalanceTokenB: 1,
      initialPairBalanceTokenA: 0,
      initialPairBalanceTokenB: 0,
      ratePerUnitBToA: 1,
      reason: `reverted with panic code 0x11 (Arithmetic operation underflowed or overflowed outside of an unchecked block)`,
    });

    swapTestFailed({
      title: 'swapping is paused',
      context: () => DCAGlobalParameters.pause(),
      nextSwapContext: [
        {
          interval: SWAP_INTERVAL,
          nextSwapToPerform: 2,
          amountToSwapOfTokenA: 2,
          amountToSwapOfTokenB: 1,
        },
      ],
      initialSwapperBalanceTokenA: 0,
      initialSwapperBalanceTokenB: 1,
      ratePerUnitBToA: 1,
      reason: `Paused`,
    });

    swapTest({
      title: 'all balance of one token is being swapped, and the other has no balance',
      nextSwapContext: [
        {
          interval: SWAP_INTERVAL,
          nextSwapToPerform: 2,
          amountToSwapOfTokenA: 1,
          amountToSwapOfTokenB: 0,
        },
      ],
      initialContractTokenABalance: 1,
      initialContractTokenBBalance: 0,
      ratePerUnitBToA: 1,
    });

    swapTest({
      title: 'one interval, rate per unit is 1:1 and needing token b to be provided externally',
      nextSwapContext: [
        {
          interval: SWAP_INTERVAL,
          nextSwapToPerform: 2,
          amountToSwapOfTokenA: 1.4,
          amountToSwapOfTokenB: 1.3,
        },
      ],
      initialContractTokenABalance: 100,
      initialContractTokenBBalance: 100,
      ratePerUnitBToA: 1,
    });

    swapTest({
      title: 'one interval, rate per unit is 1:1 and needing token a to be provided externally',
      nextSwapContext: [
        {
          interval: SWAP_INTERVAL,
          nextSwapToPerform: 2,
          amountToSwapOfTokenA: 1,
          amountToSwapOfTokenB: 1.3,
        },
      ],
      initialContractTokenABalance: 100,
      initialContractTokenBBalance: 100,
      ratePerUnitBToA: 1,
    });

    swapTest({
      title: 'one interval, rate per unit is 1:1 and there is no need to provide tokens externally',
      nextSwapContext: [
        {
          interval: SWAP_INTERVAL,
          nextSwapToPerform: 2,
          amountToSwapOfTokenA: 1,
          amountToSwapOfTokenB: 1,
        },
      ],
      initialContractTokenABalance: 100,
      initialContractTokenBBalance: 100,
      ratePerUnitBToA: 1,
    });

    swapTest({
      title: 'two intervals, rate per unit is 1:2 and needing token b to be provided externally',
      addedSwapIntervals: [SWAP_INTERVAL_2],
      nextSwapContext: [
        {
          interval: SWAP_INTERVAL,
          nextSwapToPerform: 2,
          amountToSwapOfTokenA: 1.4,
          amountToSwapOfTokenB: 2.6,
        },
        {
          interval: SWAP_INTERVAL_2,
          nextSwapToPerform: 8,
          amountToSwapOfTokenA: 1.4,
          amountToSwapOfTokenB: 2.8,
        },
      ],
      initialContractTokenABalance: 100,
      initialContractTokenBBalance: 100,
      ratePerUnitBToA: 0.5,
    });

    swapTest({
      title: 'two intervals, rate per unit is 1:2 and needing token a to be provided externally',
      addedSwapIntervals: [SWAP_INTERVAL_2],
      nextSwapContext: [
        {
          interval: SWAP_INTERVAL,
          nextSwapToPerform: 3,
          amountToSwapOfTokenA: 1,
          amountToSwapOfTokenB: 2.6,
        },
        {
          interval: SWAP_INTERVAL_2,
          nextSwapToPerform: 7,
          amountToSwapOfTokenA: 0.3,
          amountToSwapOfTokenB: 1,
        },
      ],
      initialContractTokenABalance: 100,
      initialContractTokenBBalance: 100,
      ratePerUnitBToA: 0.5,
    });

    swapTest({
      title: 'two intervals, rate per unit is 1:2 and there is no need to provide tokens externally',
      addedSwapIntervals: [SWAP_INTERVAL_2],
      nextSwapContext: [
        {
          interval: SWAP_INTERVAL,
          nextSwapToPerform: 2,
          amountToSwapOfTokenA: 1,
          amountToSwapOfTokenB: 2,
        },
        {
          interval: SWAP_INTERVAL_2,
          nextSwapToPerform: 15,
          amountToSwapOfTokenA: 0.5,
          amountToSwapOfTokenB: 1,
        },
      ],
      initialContractTokenABalance: 100,
      initialContractTokenBBalance: 100,
      ratePerUnitBToA: 0.5,
    });

    when('only swap interval has no amount to swap', () => {
      const SWAP_TO_PERFORM = 5;

      given(async () => {
        await DCAHubSwapHandler.setNextSwapsToPerform([
          {
            interval: SWAP_INTERVAL,
            swapToPerform: SWAP_TO_PERFORM,
            amountToSwapTokenA: constants.ZERO,
            amountToSwapTokenB: constants.ZERO,
          },
        ]);
        await setOracleData({ ratePerUnitBToA: tokenA.asUnits(1) });

        await DCAHubSwapHandler['swap()']();
      });
      then('swap was not registered on token a', async () => {
        expect(await DCAHubSwapHandler.swapAmountDelta(tokenA.address, tokenB.address, SWAP_INTERVAL, SWAP_TO_PERFORM)).to.be.equal(0);
      });
      then('swap was not registered on token b', async () => {
        expect(await DCAHubSwapHandler.swapAmountDelta(tokenB.address, tokenA.address, SWAP_INTERVAL, SWAP_TO_PERFORM)).to.be.equal(0);
      });
      then('next swap available did not increase', async () => {
        expect(await DCAHubSwapHandler.nextSwapAvailable(tokenA.address, tokenB.address, SWAP_INTERVAL)).to.equal(0);
      });
      then('performed swaps did not increase', async () => {
        expect(await DCAHubSwapHandler.performedSwaps(tokenA.address, tokenB.address, SWAP_INTERVAL)).to.equal(0);
      });
      then('swap interval is no longer active', async () => {
        expect(await DCAHubSwapHandler.isSwapIntervalActive(SWAP_INTERVAL)).to.be.false;
      });

      thenInternalBalancesAreTheSameAsTokenBalances();
    });
  });

  describe('flash swap', () => {
    const BYTES = ethers.utils.randomBytes(5);
    let DCAHubSwapCallee: Contract;
    let calleeInitialBalanceTokenA: BigNumber,
      calleeInitialBalanceTokenB: BigNumber,
      pairInitialBalanceTokenA: BigNumber,
      pairInitialBalanceTokenB: BigNumber;

    let amountToBeProvidedBySwapper: BigNumber,
      amountToRewardSwapperWith: BigNumber,
      platformFeeTokenA: BigNumber,
      platformFeeTokenB: BigNumber,
      availableToBorrowTokenA: BigNumber,
      availableToBorrowTokenB: BigNumber;

    given(async () => {
      [calleeInitialBalanceTokenA, calleeInitialBalanceTokenB] = [tokenA.asUnits(2), tokenB.asUnits(2)];
      [pairInitialBalanceTokenA, pairInitialBalanceTokenB] = [tokenA.asUnits(2), tokenB.asUnits(2)];

      const DCAHubSwapCalleeContract = await ethers.getContractFactory('contracts/mocks/DCAHubSwapCallee.sol:DCAHubSwapCalleeMock');
      DCAHubSwapCallee = await DCAHubSwapCalleeContract.deploy(calleeInitialBalanceTokenA, calleeInitialBalanceTokenB);
      await tokenA.mint(DCAHubSwapCallee.address, calleeInitialBalanceTokenA);
      await tokenB.mint(DCAHubSwapCallee.address, calleeInitialBalanceTokenB);
      await tokenA.mint(DCAHubSwapHandler.address, pairInitialBalanceTokenA);
      await tokenB.mint(DCAHubSwapHandler.address, pairInitialBalanceTokenB);
      await DCAHubSwapHandler.setInternalBalances(pairInitialBalanceTokenA, pairInitialBalanceTokenB);

      await DCAHubSwapHandler.setNextSwapsToPerform([
        {
          interval: SWAP_INTERVAL,
          swapToPerform: 2,
          amountToSwapTokenA: tokenA.asUnits(2),
          amountToSwapTokenB: tokenB.asUnits(1),
        },
      ]);
      await setOracleData({ ratePerUnitBToA: tokenA.asUnits(1) });

      ({
        amountToBeProvidedBySwapper,
        amountToRewardSwapperWith,
        platformFeeTokenA,
        platformFeeTokenB,
        availableToBorrowTokenA,
        availableToBorrowTokenB,
      } = await DCAHubSwapHandler['getNextSwapInfo()']());
    });

    when('doing a reentrancy attack via swap', () => {
      let tx: Promise<TransactionResponse>;
      given(async () => {
        const reentrantDCAHubSwapCalleFactory = await ethers.getContractFactory(
          'contracts/mocks/DCAHubSwapCallee.sol:ReentrantDCAHubSwapCalleeMock'
        );
        const reentrantDCAHubSwapCallee = await reentrantDCAHubSwapCalleFactory.deploy();
        await reentrantDCAHubSwapCallee.setAttack((await DCAHubSwapHandler.populateTransaction['swap()']()).data);
        tx = DCAHubSwapHandler['swap(uint256,uint256,address,bytes)'](
          availableToBorrowTokenA,
          availableToBorrowTokenB,
          reentrantDCAHubSwapCallee.address,
          BYTES
        );
      });
      then('tx is reverted', async () => {
        await expect(tx).to.be.revertedWith('ReentrancyGuard: reentrant call');
      });
    });

    when('doing a reentrancy attack via flash swap', () => {
      let tx: Promise<TransactionResponse>;
      given(async () => {
        const reentrantDCAHubSwapCalleFactory = await ethers.getContractFactory(
          'contracts/mocks/DCAHubSwapCallee.sol:ReentrantDCAHubSwapCalleeMock'
        );
        const reentrantDCAHubSwapCallee = await reentrantDCAHubSwapCalleFactory.deploy();
        await reentrantDCAHubSwapCallee.setAttack(
          (
            await DCAHubSwapHandler.populateTransaction['swap(uint256,uint256,address,bytes)'](
              availableToBorrowTokenA,
              availableToBorrowTokenB,
              reentrantDCAHubSwapCallee.address,
              BYTES
            )
          ).data
        );
        tx = DCAHubSwapHandler['swap(uint256,uint256,address,bytes)'](
          availableToBorrowTokenA,
          availableToBorrowTokenB,
          reentrantDCAHubSwapCallee.address,
          BYTES
        );
      });
      then('tx is reverted', async () => {
        await expect(tx).to.be.revertedWith('ReentrancyGuard: reentrant call');
      });
    });

    when('swapper intends to borrow more than available in a', () => {
      let tx: Promise<TransactionResponse>;
      given(async () => {
        tx = DCAHubSwapHandler['swap(uint256,uint256,address,bytes)'](
          availableToBorrowTokenA.add(1),
          availableToBorrowTokenB,
          DCAHubSwapCallee.address,
          BYTES
        );
      });
      then('tx is reverted', async () => {
        await expect(tx).to.be.revertedWith('InsufficientLiquidity');
      });
    });

    when('swapper intends to borrow more than available in b', () => {
      let tx: Promise<TransactionResponse>;
      given(async () => {
        tx = DCAHubSwapHandler['swap(uint256,uint256,address,bytes)'](
          availableToBorrowTokenA,
          availableToBorrowTokenB.add(1),
          DCAHubSwapCallee.address,
          BYTES
        );
      });
      then('tx is reverted', async () => {
        await expect(tx).to.be.revertedWith('InsufficientLiquidity');
      });
    });

    when('flash swaps are used', () => {
      let tx: TransactionResponse;

      given(async () => {
        tx = await DCAHubSwapHandler['swap(uint256,uint256,address,bytes)'](
          availableToBorrowTokenA,
          availableToBorrowTokenB,
          DCAHubSwapCallee.address,
          BYTES
        );
      });

      then('callee is called', async () => {
        const {
          pair,
          sender,
          tokenA: tokenAParam,
          tokenB: tokenBParam,
          amountBorrowedTokenA,
          amountBorrowedTokenB,
          isRewardTokenA,
          rewardAmount,
          amountToProvide,
          data,
        } = await DCAHubSwapCallee.getLastCall();
        expect(pair).to.equal(DCAHubSwapHandler.address);
        expect(sender).to.equal(owner.address);
        expect(tokenAParam).to.equal(tokenA.address);
        expect(tokenBParam).to.equal(tokenB.address);
        expect(amountBorrowedTokenA).to.equal(availableToBorrowTokenA);
        expect(amountBorrowedTokenB).to.equal(availableToBorrowTokenB);
        expect(isRewardTokenA).to.be.true;
        expect(rewardAmount).to.equal(amountToRewardSwapperWith);
        expect(amountToProvide).to.equal(amountToBeProvidedBySwapper);
        expect(data).to.equal(ethers.utils.hexlify(BYTES));
      });

      then('callee balance is modified correctly', async () => {
        const calleeTokenABalance = await tokenA.balanceOf(DCAHubSwapCallee.address);
        const calleeTokenBBalance = await tokenB.balanceOf(DCAHubSwapCallee.address);

        expect(calleeTokenABalance).to.equal(calleeInitialBalanceTokenA.add(amountToRewardSwapperWith));
        expect(calleeTokenBBalance).to.equal(calleeInitialBalanceTokenB.sub(amountToBeProvidedBySwapper));
      });

      then('pair balance is modified correctly', async () => {
        const pairTokenABalance = await tokenA.balanceOf(DCAHubSwapHandler.address);
        const pairTokenBBalance = await tokenB.balanceOf(DCAHubSwapHandler.address);

        expect(pairTokenABalance).to.equal(pairInitialBalanceTokenA.sub(amountToRewardSwapperWith).sub(platformFeeTokenA));
        expect(pairTokenBBalance).to.equal(pairInitialBalanceTokenB.add(amountToBeProvidedBySwapper).sub(platformFeeTokenB));
      });

      then('fee recipient balance is modified correctly', async () => {
        const feeRecipientTokenABalance = await tokenA.balanceOf(feeRecipient.address);
        const feeRecipientTokenBBalance = await tokenB.balanceOf(feeRecipient.address);

        expect(feeRecipientTokenABalance).to.equal(platformFeeTokenA);
        expect(feeRecipientTokenBBalance).to.equal(platformFeeTokenB);
      });

      then('emits event with correct information', async () => {
        const sender = await readArgFromEvent(tx, 'Swapped', 'sender');
        const to = await readArgFromEvent(tx, 'Swapped', 'to');
        const amountBorrowedTokenA = await readArgFromEvent(tx, 'Swapped', 'amountBorrowedTokenA');
        const amountBorrowedTokenB = await readArgFromEvent(tx, 'Swapped', 'amountBorrowedTokenB');
        const fee = await readArgFromEvent(tx, 'Swapped', 'fee');
        expect(sender).to.equal(owner.address);
        expect(to).to.equal(DCAHubSwapCallee.address);
        expect(amountBorrowedTokenA).to.equal(availableToBorrowTokenA);
        expect(amountBorrowedTokenB).to.equal(availableToBorrowTokenB);
        expect(fee).to.equal(6000);
      });

      then('active swap intervals remain the same', async () => {
        expect(await DCAHubSwapHandler.isSwapIntervalActive(SWAP_INTERVAL)).to.be.true;
        expect(await DCAHubSwapHandler.isSwapIntervalActive(SWAP_INTERVAL_2)).to.be.false;
      });

      thenInternalBalancesAreTheSameAsTokenBalances();
    });

    when('more tokens than expected are returned', () => {
      let tx: TransactionResponse;

      given(async () => {
        await DCAHubSwapCallee.returnSpecificAmounts(
          availableToBorrowTokenA.add(1),
          availableToBorrowTokenB.add(amountToBeProvidedBySwapper).add(1)
        );

        tx = await DCAHubSwapHandler['swap(uint256,uint256,address,bytes)'](
          availableToBorrowTokenA,
          availableToBorrowTokenB,
          DCAHubSwapCallee.address,
          BYTES
        );
      });

      then('extra tokens are sent to fee recipient', async () => {
        const feeRecipientTokenABalance = await tokenA.balanceOf(feeRecipient.address);
        const feeRecipientTokenBBalance = await tokenB.balanceOf(feeRecipient.address);

        expect(feeRecipientTokenABalance).to.equal(platformFeeTokenA.add(1));
        expect(feeRecipientTokenBBalance).to.equal(platformFeeTokenB.add(1));
      });

      then('pair balance is modified correctly', async () => {
        const pairTokenABalance = await tokenA.balanceOf(DCAHubSwapHandler.address);
        const pairTokenBBalance = await tokenB.balanceOf(DCAHubSwapHandler.address);

        expect(pairTokenABalance).to.equal(pairInitialBalanceTokenA.sub(amountToRewardSwapperWith).sub(platformFeeTokenA));
        expect(pairTokenBBalance).to.equal(pairInitialBalanceTokenB.add(amountToBeProvidedBySwapper).sub(platformFeeTokenB));
      });

      thenInternalBalancesAreTheSameAsTokenBalances();
    });

    flashSwapNotReturnedTest({
      title: 'amount to provide is not provided',
      amountToBorrowTokenA: () => constants.ZERO,
      amountToBorrowTokenB: () => constants.ZERO,
      amountToReturnTokenA: () => constants.ZERO,
      amountToReturnTokenB: () => constants.ZERO,
    });

    flashSwapNotReturnedTest({
      title: 'borrowed token a is not returned',
      amountToBorrowTokenA: () => availableToBorrowTokenA,
      amountToBorrowTokenB: () => availableToBorrowTokenB,
      amountToReturnTokenA: () => constants.ZERO,
      amountToReturnTokenB: () => availableToBorrowTokenB.add(amountToBeProvidedBySwapper),
    });

    flashSwapNotReturnedTest({
      title: 'borrowed token b is not returned',
      amountToBorrowTokenA: () => availableToBorrowTokenA,
      amountToBorrowTokenB: () => availableToBorrowTokenB,
      amountToReturnTokenA: () => availableToBorrowTokenA,
      amountToReturnTokenB: () => amountToBeProvidedBySwapper,
    });

    function flashSwapNotReturnedTest({
      title,
      amountToBorrowTokenA,
      amountToBorrowTokenB,
      amountToReturnTokenA,
      amountToReturnTokenB,
    }: {
      title: string;
      amountToBorrowTokenA: () => BigNumber;
      amountToBorrowTokenB: () => BigNumber;
      amountToReturnTokenA: () => BigNumber;
      amountToReturnTokenB: () => BigNumber;
    }) {
      when(title, () => {
        let tx: Promise<TransactionResponse>;

        given(async () => {
          await DCAHubSwapCallee.returnSpecificAmounts(amountToReturnTokenA(), amountToReturnTokenB());
          tx = DCAHubSwapHandler['swap(uint256,uint256,address,bytes)'](
            amountToBorrowTokenA(),
            amountToBorrowTokenB(),
            DCAHubSwapCallee.address,
            BYTES
          );
          await behaviours.waitForTxAndNotThrow(tx);
        });

        then('tx is reverted', async () => {
          await expect(tx).to.be.revertedWith('LiquidityNotReturned');
        });

        then('callee state is not modified', async () => {
          const wasCalled = await DCAHubSwapCallee.wasThereACall();
          expect(wasCalled).to.be.false;
        });

        then('callee balance is not modified', async () => {
          const calleeTokenABalance = await tokenA.balanceOf(DCAHubSwapCallee.address);
          const calleeTokenBBalance = await tokenB.balanceOf(DCAHubSwapCallee.address);

          expect(calleeTokenABalance).to.equal(calleeInitialBalanceTokenA);
          expect(calleeTokenBBalance).to.equal(calleeInitialBalanceTokenB);
        });

        then('pair balance is not modified', async () => {
          const pairTokenABalance = await tokenA.balanceOf(DCAHubSwapHandler.address);
          const pairTokenBBalance = await tokenB.balanceOf(DCAHubSwapHandler.address);

          expect(pairTokenABalance).to.equal(pairInitialBalanceTokenA);
          expect(pairTokenBBalance).to.equal(pairInitialBalanceTokenB);
        });

        thenInternalBalancesAreTheSameAsTokenBalances();
      });
    }
  });

  describe('secondsUntilNextSwap', () => {
    secondsUntilNextSwapTest({
      title: 'there are not active intervals',
      intervals: [],
      blockTimestamp: 1000,
      expected: 2 ** 32 - 1,
    });

    secondsUntilNextSwapTest({
      title: 'one of the intervals can be swapped already',
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
      blockTimestamp: 1000,
      expected: 0,
    });

    secondsUntilNextSwapTest({
      title: 'none of the intervals can be swapped right now',
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
      blockTimestamp: 1000,
      expected: 200,
    });

    async function secondsUntilNextSwapTest({
      title,
      intervals,
      blockTimestamp,
      expected,
    }: {
      title: string;
      intervals: { interval: number; nextAvailable: number }[];
      blockTimestamp: number;
      expected: number;
    }) {
      when(title, () => {
        given(async () => {
          // This is added automatically. Will remove it and re-add it if test needs it
          await DCAHubSwapHandler.removeActiveSwapInterval(SWAP_INTERVAL);

          for (const { interval, nextAvailable } of intervals) {
            await DCAHubSwapHandler.addActiveSwapInterval(interval);
            await DCAHubSwapHandler.setNextSwapAvailable(interval, nextAvailable);
          }
          await DCAHubSwapHandler.setBlockTimestamp(blockTimestamp);
        });

        then('result is as expected', async () => {
          const result = await DCAHubSwapHandler.secondsUntilNextSwap();
          expect(result).to.equal(expected);
        });
      });
    }
  });

  function swapTest({
    title,
    context,
    addedSwapIntervals,
    nextSwapContext,
    blockTimestamp,
    initialContractTokenABalance,
    initialContractTokenBBalance,
    ratePerUnitBToA,
    threshold,
  }: {
    title: string;
    context?: () => Promise<void>;
    nextSwapContext: NextSwapInformationContext[];
    addedSwapIntervals?: number[];
    blockTimestamp?: number;
    initialContractTokenABalance: BigNumber | number | string;
    initialContractTokenBBalance: BigNumber | number | string;
    ratePerUnitBToA: BigNumber | number | string;
    threshold?: BigNumber | number;
  }) {
    threshold = bn.toBN(threshold ?? 1);
    let ratePerUnitAToB: BigNumber;
    let totalAmountToSwapOfTokenA: BigNumber;
    let totalAmountToSwapOfTokenB: BigNumber;
    let platformFeeTokenA: BigNumber;
    let platformFeeTokenB: BigNumber;
    let amountToBeProvidedBySwapper: BigNumber;
    let amountToRewardSwapperWith: BigNumber;
    let tokenToBeProvidedBySwapper: () => string;
    let tokenToRewardSwapperWith: () => string;
    let initialSwapperTokenABalance: BigNumber;
    let initialSwapperTokenBBalance: BigNumber;
    let swapTx: TransactionResponse;

    when(title, () => {
      given(async () => {
        if (context) {
          await context();
        }
        for (const interval of addedSwapIntervals ?? []) {
          await DCAHubSwapHandler.addActiveSwapInterval(interval);
        }
        initialContractTokenABalance = toBN(initialContractTokenABalance, tokenA);
        initialContractTokenBBalance = toBN(initialContractTokenBBalance, tokenB);
        totalAmountToSwapOfTokenA = toBN(
          sumAmountFromContext(nextSwapContext, (swapContext) => swapContext.amountToSwapOfTokenA),
          tokenA
        );
        totalAmountToSwapOfTokenB = toBN(
          sumAmountFromContext(nextSwapContext, (swapContext) => swapContext.amountToSwapOfTokenB),
          tokenB
        );
        ratePerUnitBToA = toBN(ratePerUnitBToA, tokenA);
        ({
          ratePerUnitAToB,
          platformFeeTokenA,
          platformFeeTokenB,
          amountToBeProvidedBySwapper,
          amountToRewardSwapperWith,
          tokenToBeProvidedBySwapper,
          tokenToRewardSwapperWith,
        } = calculateSwapDetails(ratePerUnitBToA, totalAmountToSwapOfTokenB, totalAmountToSwapOfTokenA));
        blockTimestamp = blockTimestamp ?? moment().unix();
        await DCAHubSwapHandler.setBlockTimestamp(blockTimestamp);

        await DCAHubSwapHandler.setNextSwapsToPerform(
          nextSwapContext.map(({ interval, nextSwapToPerform, amountToSwapOfTokenA, amountToSwapOfTokenB }) => ({
            interval,
            swapToPerform: nextSwapToPerform,
            amountToSwapTokenA: tokenA.asUnits(amountToSwapOfTokenA),
            amountToSwapTokenB: tokenB.asUnits(amountToSwapOfTokenB),
          }))
        );
        await setOracleData({ ratePerUnitBToA });

        await tokenA.transfer(DCAHubSwapHandler.address, initialContractTokenABalance);
        await tokenB.transfer(DCAHubSwapHandler.address, initialContractTokenBBalance);
        await DCAHubSwapHandler.setInternalBalances(initialContractTokenABalance, initialContractTokenBBalance);
        initialSwapperTokenABalance = await tokenA.balanceOf(owner.address);
        initialSwapperTokenBBalance = await tokenB.balanceOf(owner.address);

        // Ideally, this would be done by a smart contract on the same tx as the swap
        if (tokenToBeProvidedBySwapper() === tokenA.address) {
          await tokenA.transfer(DCAHubSwapHandler.address, (amountToBeProvidedBySwapper as BigNumber).add(threshold!));
        } else {
          await tokenB.transfer(DCAHubSwapHandler.address, (amountToBeProvidedBySwapper as BigNumber).add(threshold!));
        }

        swapTx = await DCAHubSwapHandler['swap()']();
      });
      then('token to be provided by swapper needed is provided', async () => {
        if (!tokenToBeProvidedBySwapper) {
          expect(await tokenA.balanceOf(DCAHubSwapHandler.address)).to.equal((initialContractTokenABalance as BigNumber).sub(platformFeeTokenA));
          expect(await tokenB.balanceOf(DCAHubSwapHandler.address)).to.equal((initialContractTokenBBalance as BigNumber).sub(platformFeeTokenB));
        } else if (tokenToBeProvidedBySwapper() === tokenA.address) {
          expect(await tokenA.balanceOf(DCAHubSwapHandler.address)).to.equal(
            (initialContractTokenABalance as BigNumber).add(amountToBeProvidedBySwapper).sub(platformFeeTokenA)
          );
        } else if (tokenToBeProvidedBySwapper() === tokenB.address) {
          expect(await tokenB.balanceOf(DCAHubSwapHandler.address)).to.equal(
            (initialContractTokenBBalance as BigNumber).add(amountToBeProvidedBySwapper).sub(platformFeeTokenB)
          );
        }
      });
      then('token to be provided by swapper is taken from swapper', async () => {
        if (!tokenToBeProvidedBySwapper) {
          bn.expectToEqualWithThreshold({
            value: await tokenA.balanceOf(owner.address),
            to: initialSwapperTokenABalance,
            threshold: constants.ZERO,
          });
          bn.expectToEqualWithThreshold({
            value: await tokenB.balanceOf(owner.address),
            to: initialSwapperTokenBBalance,
            threshold: constants.ZERO,
          });
        } else if (tokenToBeProvidedBySwapper() === tokenA.address) {
          bn.expectToEqualWithThreshold({
            value: await tokenA.balanceOf(owner.address),
            to: initialSwapperTokenABalance.sub(amountToBeProvidedBySwapper),
            threshold: threshold!,
          });
        } else if (tokenToBeProvidedBySwapper() === tokenB.address) {
          bn.expectToEqualWithThreshold({
            value: await tokenB.balanceOf(owner.address),
            to: initialSwapperTokenBBalance.sub(amountToBeProvidedBySwapper),
            threshold: threshold!,
          });
        }
      });
      then('token to reward the swapper with is taken from the pair', async () => {
        if (!tokenToRewardSwapperWith) {
          bn.expectToEqualWithThreshold({
            value: await tokenA.balanceOf(DCAHubSwapHandler.address),
            to: (initialContractTokenABalance as BigNumber).sub(platformFeeTokenA),
            threshold: threshold!,
          });
          bn.expectToEqualWithThreshold({
            value: await tokenB.balanceOf(DCAHubSwapHandler.address),
            to: (initialContractTokenBBalance as BigNumber).sub(platformFeeTokenB),
            threshold: threshold!,
          });
        } else if (tokenToRewardSwapperWith() === tokenA.address) {
          bn.expectToEqualWithThreshold({
            value: (await tokenA.balanceOf(DCAHubSwapHandler.address)).add(platformFeeTokenA),
            to: (initialContractTokenABalance as BigNumber).sub(amountToRewardSwapperWith),
            threshold: threshold!,
          });
        } else if (tokenToRewardSwapperWith() === tokenB.address) {
          bn.expectToEqualWithThreshold({
            value: (await tokenB.balanceOf(DCAHubSwapHandler.address)).add(platformFeeTokenB),
            to: (initialContractTokenBBalance as BigNumber).sub(amountToRewardSwapperWith),
            threshold: threshold!,
          });
        }
      });
      then('token to reward the swapper is sent to the swapper', async () => {
        if (!tokenToRewardSwapperWith) {
          expect(await tokenA.balanceOf(owner.address)).to.equal(initialSwapperTokenABalance);
          expect(await tokenB.balanceOf(owner.address)).to.equal(initialSwapperTokenBBalance);
        } else if (tokenToRewardSwapperWith() === tokenA.address) {
          bn.expectToEqualWithThreshold({
            value: await tokenA.balanceOf(owner.address),
            to: initialSwapperTokenABalance.add(amountToRewardSwapperWith),
            threshold: threshold!,
          });
        } else if (tokenToRewardSwapperWith() === tokenB.address) {
          bn.expectToEqualWithThreshold({
            value: await tokenB.balanceOf(owner.address),
            to: initialSwapperTokenBBalance.add(amountToRewardSwapperWith),
            threshold: threshold!,
          });
        }
      });
      then('register swaps with correct information', async () => {
        for (let i = 0; i < nextSwapContext.length; i++) {
          const call = await DCAHubSwapHandler.registerSwapCalls(tokenA.address, tokenB.address, nextSwapContext[i].interval);
          expect(call.timestamp).to.equal(blockTimestamp!);
          expect(call.ratePerUnitAToB).to.equal(APPLY_FEE(ratePerUnitAToB as BigNumber));
          expect(call.ratePerUnitBToA).to.equal(APPLY_FEE(ratePerUnitBToA as BigNumber));
        }
      });
      then('sends token a fee correctly to fee recipient', async () => {
        bn.expectToEqualWithThreshold({
          value: await tokenA.balanceOf(feeRecipient.address),
          to: platformFeeTokenA,
          threshold: threshold!,
        });
      });
      then('sends token b fee correctly to fee recipient', async () => {
        bn.expectToEqualWithThreshold({
          value: await tokenB.balanceOf(feeRecipient.address),
          to: platformFeeTokenB,
          threshold: threshold!,
        });
      });
      then('emits event with correct information', async () => {
        const nextSwapInformation = (await readArgFromEvent(swapTx, 'Swapped', 'nextSwapInformation')) as NextSwapInfo;
        const parsedNextSwaps = parseNextSwaps(nextSwapContext);
        expect(nextSwapInformation.swapsToPerform).to.deep.equal(parsedNextSwaps.nextSwaps);
        expect(nextSwapInformation.amountOfSwaps).to.equal(parsedNextSwaps.amount);
        bn.expectToEqualWithThreshold({
          value: nextSwapInformation.ratePerUnitBToA,
          to: ratePerUnitBToA,
          threshold: threshold!,
        });
        bn.expectToEqualWithThreshold({
          value: nextSwapInformation.ratePerUnitAToB,
          to: ratePerUnitAToB,
          threshold: threshold!,
        });
        bn.expectToEqualWithThreshold({
          value: nextSwapInformation.platformFeeTokenA,
          to: platformFeeTokenA,
          threshold: threshold!,
        });
        bn.expectToEqualWithThreshold({
          value: nextSwapInformation.platformFeeTokenB,
          to: platformFeeTokenB,
          threshold: threshold!,
        });
        bn.expectToEqualWithThreshold({
          value: nextSwapInformation.amountToBeProvidedBySwapper,
          to: amountToBeProvidedBySwapper,
          threshold: threshold!,
        });
        bn.expectToEqualWithThreshold({
          value: nextSwapInformation.amountToRewardSwapperWith,
          to: amountToRewardSwapperWith,
          threshold: threshold!,
        });
        if (!tokenToBeProvidedBySwapper) {
          expect(nextSwapInformation.tokenToBeProvidedBySwapper).to.equal(constants.ZERO_ADDRESS);
          expect(nextSwapInformation.tokenToRewardSwapperWith).to.equal(constants.ZERO_ADDRESS);
        } else {
          expect(nextSwapInformation.tokenToBeProvidedBySwapper).to.equal(tokenToBeProvidedBySwapper());
          expect(nextSwapInformation.tokenToRewardSwapperWith).to.equal(tokenToRewardSwapperWith!());
        }
        const sender = await readArgFromEvent(swapTx, 'Swapped', 'sender');
        const to = await readArgFromEvent(swapTx, 'Swapped', 'to');
        const amountBorrowedTokenA = await readArgFromEvent(swapTx, 'Swapped', 'amountBorrowedTokenA');
        const amountBorrowedTokenB = await readArgFromEvent(swapTx, 'Swapped', 'amountBorrowedTokenB');
        const fee = await readArgFromEvent(swapTx, 'Swapped', 'fee');
        expect(sender).to.equal(owner.address);
        expect(to).to.equal(owner.address);
        expect(amountBorrowedTokenA).to.equal(constants.ZERO);
        expect(amountBorrowedTokenB).to.equal(constants.ZERO);
        expect(fee).to.equal(6000);
      });

      then('active swap intervals remain the same', async () => {
        expect(await DCAHubSwapHandler.isSwapIntervalActive(SWAP_INTERVAL)).to.true;
        for (const addedSwapInterval of addedSwapIntervals ?? []) {
          expect(await DCAHubSwapHandler.isSwapIntervalActive(addedSwapInterval)).to.true;
        }
      });

      thenInternalBalancesAreTheSameAsTokenBalances(threshold as BigNumber);
    });
  }

  function thenInternalBalancesAreTheSameAsTokenBalances(threshold: BigNumber = BigNumber.from(0)) {
    then('internal balance for token A is as expected', async () => {
      const balance = await tokenA.balanceOf(DCAHubSwapHandler.address);
      const internalBalance = await DCAHubSwapHandler.internalBalanceOf(tokenA.address);
      bn.expectToEqualWithThreshold({
        value: internalBalance,
        to: balance,
        threshold,
      });
    });

    then('internal balance for token B is as expected', async () => {
      const balance = await tokenB.balanceOf(DCAHubSwapHandler.address);
      const internalBalance = await DCAHubSwapHandler.internalBalanceOf(tokenB.address);
      bn.expectToEqualWithThreshold({
        value: internalBalance,
        to: balance,
        threshold,
      });
    });
  }

  function calculateSwapDetails(ratePerUnitBToA: BigNumber, amountToSwapOfTokenB: BigNumber, amountToSwapOfTokenA: BigNumber) {
    let ratePerUnitAToB: BigNumber;
    let platformFeeTokenA: BigNumber;
    let platformFeeTokenB: BigNumber;
    let amountToBeProvidedBySwapper: BigNumber;
    let amountToRewardSwapperWith: BigNumber;
    let tokenToBeProvidedBySwapper: () => string;
    let tokenToRewardSwapperWith: () => string;

    ratePerUnitAToB = tokenA.magnitude.mul(tokenB.magnitude).div(ratePerUnitBToA);
    const amountToSwapBInA = amountToSwapOfTokenB.mul(ratePerUnitBToA).div(tokenB.magnitude);
    if (amountToSwapBInA.eq(amountToSwapOfTokenA)) {
      tokenToBeProvidedBySwapper = () => constants.ZERO_ADDRESS;
      tokenToRewardSwapperWith = () => constants.ZERO_ADDRESS;
      amountToBeProvidedBySwapper = bn.toBN(0);
      amountToRewardSwapperWith = bn.toBN(0);
      platformFeeTokenA = CALCULATE_FEE(amountToSwapOfTokenA);
      platformFeeTokenB = CALCULATE_FEE(amountToSwapOfTokenB);
    } else if (amountToSwapBInA.gt(amountToSwapOfTokenA)) {
      tokenToBeProvidedBySwapper = () => tokenA.address;
      tokenToRewardSwapperWith = () => tokenB.address;
      const needed = amountToSwapBInA.sub(amountToSwapOfTokenA);
      const neededConvertedToB = needed.mul(ratePerUnitAToB).div(tokenA.magnitude);
      amountToBeProvidedBySwapper = needed.sub(CALCULATE_FEE(needed));
      amountToRewardSwapperWith = neededConvertedToB;
      platformFeeTokenA = CALCULATE_FEE(amountToSwapOfTokenA);
      platformFeeTokenB = CALCULATE_FEE(amountToSwapOfTokenB.sub(neededConvertedToB));
    } else {
      tokenToBeProvidedBySwapper = () => tokenB.address;
      tokenToRewardSwapperWith = () => tokenA.address;
      const amountToSwapAInB = amountToSwapOfTokenA.mul(ratePerUnitAToB).div(tokenA.magnitude);
      const needed = amountToSwapAInB.sub(amountToSwapOfTokenB);
      const neededConvertedToA = needed.mul(ratePerUnitBToA).div(tokenB.magnitude);
      amountToBeProvidedBySwapper = needed.sub(CALCULATE_FEE(needed));
      amountToRewardSwapperWith = neededConvertedToA;
      platformFeeTokenA = CALCULATE_FEE(amountToSwapOfTokenA.sub(neededConvertedToA));
      platformFeeTokenB = CALCULATE_FEE(amountToSwapOfTokenB);
    }

    return {
      ratePerUnitAToB,
      platformFeeTokenA,
      platformFeeTokenB,
      amountToBeProvidedBySwapper,
      amountToRewardSwapperWith,
      tokenToBeProvidedBySwapper,
      tokenToRewardSwapperWith,
    };
  }

  function sumAmountFromContext(nextSwapContext: NextSwapInformationContext[], transform: (context: NextSwapInformationContext) => number) {
    return nextSwapContext.map(transform).reduce((a, b) => a + b, 0);
  }

  function toBN(amount: BigNumber | string | number, token: TokenContract): BigNumber {
    if (BigNumber.isBigNumber(amount)) return amount;
    if (typeof amount === 'string') return token.asUnits(amount);
    return token.asUnits(amount.toFixed(tokenA.amountOfDecimals));
  }

  type SwapInformation = {
    tokens: { token: string; reward: BigNumber; toProvide: BigNumber; platformFee: BigNumber }[];
    pairs: { tokenA: string; tokenB: string; ratioAToB: BigNumber; ratioBToA: BigNumber; intervalsInSwap: number[] }[];
  };
});
