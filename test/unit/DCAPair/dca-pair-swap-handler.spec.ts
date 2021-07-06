import moment from 'moment';
import { expect } from 'chai';
import { BigNumber, Contract, ContractFactory, Wallet } from 'ethers';
import { ethers } from 'hardhat';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { constants, erc20, behaviours, evm, bn, wallet } from '../../utils';
import { given, then, when } from '../../utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { readArgFromEvent } from '../../utils/event-utils';
import { TokenContract } from '../../utils/erc20';

const APPLY_FEE = (bn: BigNumber) => bn.mul(3).div(1000);

describe('DCAPairSwapHandler', () => {
  let owner: SignerWithAddress;
  let feeRecipient: SignerWithAddress;
  let tokenA: TokenContract, tokenB: TokenContract;
  let DCAPairSwapHandlerContract: ContractFactory;
  let DCAPairSwapHandler: Contract;
  let staticSlidingOracleContract: ContractFactory;
  let staticSlidingOracle: Contract;
  let DCAGlobalParametersContract: ContractFactory;
  let DCAGlobalParameters: Contract;
  const SWAP_INTERVAL = moment.duration(1, 'days').as('seconds');
  const SWAP_INTERVAL_2 = moment.duration(2, 'days').as('seconds');

  before('Setup accounts and contracts', async () => {
    [owner, feeRecipient] = await ethers.getSigners();
    DCAGlobalParametersContract = await ethers.getContractFactory(
      'contracts/mocks/DCAGlobalParameters/DCAGlobalParameters.sol:DCAGlobalParametersMock'
    );
    DCAPairSwapHandlerContract = await ethers.getContractFactory('contracts/mocks/DCAPair/DCAPairSwapHandler.sol:DCAPairSwapHandlerMock');
    staticSlidingOracleContract = await ethers.getContractFactory('contracts/mocks/StaticSlidingOracle.sol:StaticSlidingOracle');
  });

  beforeEach('Deploy and configure', async () => {
    await evm.reset();
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
    staticSlidingOracle = await staticSlidingOracleContract.deploy(0, 0);
    DCAGlobalParameters = await DCAGlobalParametersContract.deploy(owner.address, feeRecipient.address, constants.NOT_ZERO_ADDRESS);
    DCAPairSwapHandler = await DCAPairSwapHandlerContract.deploy(
      tokenA.address,
      tokenB.address,
      DCAGlobalParameters.address, // global parameters
      staticSlidingOracle.address // oracle
    );
    await DCAPairSwapHandler.addActiveSwapInterval(SWAP_INTERVAL);
  });

  describe('constructor', () => {
    when('global parameters is zero', () => {
      then('reverts with message', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: DCAPairSwapHandlerContract,
          args: [tokenA.address, tokenB.address, constants.ZERO_ADDRESS, staticSlidingOracle.address],
          message: 'ZeroAddress',
        });
      });
    });
    when('oracle is zero', () => {
      then('reverts with message', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: DCAPairSwapHandlerContract,
          args: [tokenA.address, tokenB.address, DCAGlobalParameters.address, constants.ZERO_ADDRESS],
          message: 'ZeroAddress',
        });
      });
    });
    when('all arguments are valid', () => {
      let DCAPairSwapHandler: Contract;

      given(async () => {
        DCAPairSwapHandler = await DCAPairSwapHandlerContract.deploy(
          tokenA.address,
          tokenB.address,
          DCAGlobalParameters.address, // global parameters
          staticSlidingOracle.address
        );
      });

      it('oracle is set correctly', async () => {
        expect(await DCAPairSwapHandler.oracle()).to.equal(staticSlidingOracle.address);
      });
    });
  });

  function addNewRatePerUnitTest({
    title,
    token,
    previousAccumRatesPerUnit,
    performedSwap,
    ratePerUnit,
  }: {
    title: string;
    token: () => string;
    previousAccumRatesPerUnit: BigNumber | number | string;
    performedSwap: BigNumber | number | string;
    ratePerUnit: BigNumber | number | string;
  }) {
    const previousAccumRatesPerUnitBN = bn.toBN(previousAccumRatesPerUnit);
    const performedSwapBN = bn.toBN(performedSwap);
    const ratePerUnitBN = bn.toBN(ratePerUnit);

    when(title, () => {
      given(async () => {
        await DCAPairSwapHandler.setAcummRatesPerUnit(SWAP_INTERVAL, token(), performedSwapBN.sub(1), previousAccumRatesPerUnitBN);
        await DCAPairSwapHandler.addNewRatePerUnit(SWAP_INTERVAL, token(), performedSwapBN, ratePerUnit);
      });
      then('increments the rates per unit accumulator', async () => {
        const accumRatesPerUnit = await DCAPairSwapHandler.accumRatesPerUnit(SWAP_INTERVAL, token(), performedSwapBN);
        expect(accumRatesPerUnit).to.equal(previousAccumRatesPerUnitBN.add(ratePerUnitBN));
      });
    });
  }

  describe('_addNewRatePerUnit', () => {
    addNewRatePerUnitTest({
      title: 'is the first swap of token A',
      token: () => tokenA.address,
      previousAccumRatesPerUnit: 0,
      performedSwap: 1,
      ratePerUnit: 123456789,
    });

    addNewRatePerUnitTest({
      title: 'the addition does not overflow the accumulated rates per unit of token A',
      token: () => tokenA.address,
      previousAccumRatesPerUnit: 123456789,
      performedSwap: 2,
      ratePerUnit: 9991230,
    });

    addNewRatePerUnitTest({
      title: 'is the first swap of token B',
      token: () => tokenB.address,
      previousAccumRatesPerUnit: 0,
      performedSwap: 1,
      ratePerUnit: 123456789,
    });
    addNewRatePerUnitTest({
      title: 'the addition does not overflow the accumulated rates per unit of token B',
      token: () => tokenB.address,
      previousAccumRatesPerUnit: 123456789,
      performedSwap: 2,
      ratePerUnit: 9991230,
    });
  });

  function registerSwapTest({
    title,
    token,
    internalAmountUsedToSwap,
    performedSwap,
    ratePerUnit,
  }: {
    title: string;
    token: () => string;
    internalAmountUsedToSwap: BigNumber | number | string;
    performedSwap: BigNumber | number | string;
    ratePerUnit: BigNumber | number | string;
  }) {
    const internalAmountUsedToSwapBN = bn.toBN(internalAmountUsedToSwap);
    const performedSwapBN = bn.toBN(performedSwap);
    const ratePerUnitBN = bn.toBN(ratePerUnit);
    when(title, () => {
      given(async () => {
        await DCAPairSwapHandler.registerSwap(SWAP_INTERVAL, token(), internalAmountUsedToSwapBN, ratePerUnitBN, performedSwapBN);
      });
      then('sets swap amount accumulator to last internal swap', async () => {
        expect(await DCAPairSwapHandler.swapAmountAccumulator(SWAP_INTERVAL, token())).to.equal(internalAmountUsedToSwapBN);
      });
      then('adds new rate per unit', async () => {
        // expect('_addNewRatePerUnit').to.be.calledOnContractWith(DCAPairSwapHandler, [token(), performedSwapBN, ratePerUnitBN]);
      });
      then('deletes swap amount delta of swap to register', async () => {
        expect(await DCAPairSwapHandler.swapAmountDelta(SWAP_INTERVAL, token(), performedSwapBN)).to.equal(0);
      });
    });
  }

  describe('_registerSwap', () => {
    registerSwapTest({
      title: 'its the first swap to register of token A',
      token: () => tokenA.address,
      internalAmountUsedToSwap: 12345,
      performedSwap: 1,
      ratePerUnit: 9999,
    });

    registerSwapTest({
      title: 'its not the first swap to register of token A',
      token: () => tokenA.address,
      internalAmountUsedToSwap: 665441,
      performedSwap: 12,
      ratePerUnit: 542,
    });

    registerSwapTest({
      title: 'its the first swap to register of token B',
      token: () => tokenB.address,
      internalAmountUsedToSwap: 12345,
      performedSwap: 1,
      ratePerUnit: 9999,
    });

    registerSwapTest({
      title: 'its not the first swap to register of token B',
      token: () => tokenB.address,
      internalAmountUsedToSwap: 665441,
      performedSwap: 12,
      ratePerUnit: 542,
    });
  });

  describe('_getAmountToSwap', () => {
    when('the amount to swap is augmented (swap amount delta is positive)', () => {
      let swapAmountAccumulator = ethers.constants.MaxUint256.div(2);
      let swapAmountDeltas: BigNumber[] = [];
      const getRandomInt = (min: number, max: number): number => Math.floor(Math.random() * (max - min)) + min;

      beforeEach(async () => {
        await DCAPairSwapHandler.setSwapAmountAccumulator(SWAP_INTERVAL, tokenA.address, swapAmountAccumulator);
        for (let i = 1; i <= 10; i++) {
          swapAmountDeltas.push(BigNumber.from(`${getRandomInt(1, 9999999999)}`));
          await DCAPairSwapHandler.setSwapAmountDelta(SWAP_INTERVAL, tokenA.address, BigNumber.from(i), swapAmountDeltas[i - 1]);
        }
      });
      it('returns augments amount to swap', async () => {
        for (let i = 1; i <= 10; i++) {
          expect(await DCAPairSwapHandler.swapAmountAccumulator(SWAP_INTERVAL, tokenA.address)).to.equal(swapAmountAccumulator);
          const amountToSwap = swapAmountAccumulator.add(swapAmountDeltas[i - 1]);
          expect(amountToSwap).to.be.gt(swapAmountAccumulator);
          expect(await DCAPairSwapHandler.getAmountToSwap(SWAP_INTERVAL, tokenA.address, i)).to.equal(amountToSwap);
          await DCAPairSwapHandler.setSwapAmountAccumulator(SWAP_INTERVAL, tokenA.address, amountToSwap);
          swapAmountAccumulator = amountToSwap;
        }
      });
    });
    when('the amount to swap is reduced (swap amount delta negative)', () => {
      context('and swap delta is type(int256).min', () => {
        const swapAmountAccumulator = constants.MAX_INT_256.add(1);
        const swapAmountDelta = constants.MIN_INT_256;
        const swap = BigNumber.from('1');
        beforeEach(async () => {
          await DCAPairSwapHandler.setSwapAmountAccumulator(SWAP_INTERVAL, tokenA.address, swapAmountAccumulator);
          await DCAPairSwapHandler.setSwapAmountDelta(SWAP_INTERVAL, tokenA.address, swap, swapAmountDelta);
        });
        it('calculates correctly the final amount to buy', async () => {
          expect(await DCAPairSwapHandler.swapAmountAccumulator(SWAP_INTERVAL, tokenA.address)).to.equal(swapAmountAccumulator);
          const amountToSwap = await DCAPairSwapHandler.getAmountToSwap(SWAP_INTERVAL, tokenA.address, swap);
          expect(amountToSwap).to.be.lt(swapAmountAccumulator);
          expect(amountToSwap).to.equal(swapAmountAccumulator.add(swapAmountDelta));
        });
      });
      context('and swap delta is not a extreme parameter', () => {
        let swapAmountAccumulator = ethers.constants.MaxUint256.div(2);
        let swapAmountDeltas: BigNumber[] = [];
        beforeEach(async () => {
          await DCAPairSwapHandler.setSwapAmountAccumulator(SWAP_INTERVAL, tokenA.address, swapAmountAccumulator);
          for (let i = 1; i <= 10; i++) {
            swapAmountDeltas.push(BigNumber.from(`${Math.floor(Math.random() * 1000000) - 999999}`));
            await DCAPairSwapHandler.setSwapAmountDelta(SWAP_INTERVAL, tokenA.address, BigNumber.from(i), swapAmountDeltas[i - 1]);
          }
        });
        it('returns reduced amount to swap', async () => {
          for (let i = 1; i <= 10; i++) {
            expect(await DCAPairSwapHandler.swapAmountAccumulator(SWAP_INTERVAL, tokenA.address)).to.equal(swapAmountAccumulator);
            const amountToSwap = swapAmountAccumulator.add(swapAmountDeltas[i - 1]);
            expect(amountToSwap).to.be.lt(swapAmountAccumulator);
            expect(await DCAPairSwapHandler.getAmountToSwap(SWAP_INTERVAL, tokenA.address, i)).to.equal(amountToSwap);
            await DCAPairSwapHandler.setSwapAmountAccumulator(SWAP_INTERVAL, tokenA.address, amountToSwap);
            swapAmountAccumulator = amountToSwap;
          }
        });
      });
    });
  });

  const setOracleData = async ({ ratePerUnitBToA }: { ratePerUnitBToA: BigNumber }) => {
    const tokenBDecimals = BigNumber.from(await tokenB.decimals());
    await staticSlidingOracle.setRate(ratePerUnitBToA, tokenBDecimals);
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
      await DCAPairSwapHandler.setNextSwapAvailable(nextSwapInfo[i].interval, nextSwapInfo[i].nextSwapAvailableAt ?? blockTimestamp);
      await DCAPairSwapHandler.setPerformedSwaps(nextSwapInfo[i].interval, nextSwapToPerform.sub(1));
      await DCAPairSwapHandler.setSwapAmountAccumulator(nextSwapInfo[i].interval, tokenA.address, amountToSwapOfTokenA.div(2));
      await DCAPairSwapHandler.setSwapAmountDelta(nextSwapInfo[i].interval, tokenA.address, nextSwapToPerform, amountToSwapOfTokenA.div(2));
      await DCAPairSwapHandler.setSwapAmountAccumulator(nextSwapInfo[i].interval, tokenB.address, amountToSwapOfTokenB.div(2));
      await DCAPairSwapHandler.setSwapAmountDelta(nextSwapInfo[i].interval, tokenB.address, nextSwapToPerform, amountToSwapOfTokenB.div(2));
    }
  };

  type NextSwapInfo = {
    swapsToPerform: {
      interval: BigNumber;
      swapToPerform: BigNumber;
      amountToSwapTokenA: BigNumber;
      amountToSwapTokenB: BigNumber;
    }[];
    amountOfSwaps: number;
    amountToSwapTokenA: BigNumber;
    amountToSwapTokenB: BigNumber;
    ratePerUnitBToA: BigNumber;
    ratePerUnitAToB: BigNumber;
    platformFeeTokenA: BigNumber;
    platformFeeTokenB: BigNumber;
    availableToBorrowTokenA: BigNumber;
    availableToBorrowTokenB: BigNumber;
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
    context?: () => Promise<void>;
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
        await DCAPairSwapHandler.setBlockTimestamp(blockTimestamp);
        await setNextSwapInfoContext({
          nextSwapInfo: nextSwapContext,
          blockTimestamp,
        });
        ({ nextSwaps: parsedNextSwaps } = parseNextSwaps(nextSwapContext, blockTimestamp));
        nextSwapsToPerform = (await DCAPairSwapHandler.getNextSwapsToPerform())[0];
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
      context: () => DCAPairSwapHandler.removeActiveSwapInterval(SWAP_INTERVAL),
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
      context: () => DCAPairSwapHandler.addActiveSwapInterval(SWAP_INTERVAL_2),
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
      context: () => DCAPairSwapHandler.addActiveSwapInterval(SWAP_INTERVAL_2),
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
      context: () => DCAPairSwapHandler.addActiveSwapInterval(SWAP_INTERVAL_2),
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
    context?: () => Promise<void>;
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
        await DCAPairSwapHandler.setNextSwapsToPerform(
          nextSwapContext.map(({ interval, nextSwapToPerform, amountToSwapOfTokenA, amountToSwapOfTokenB }) => ({
            interval,
            swapToPerform: nextSwapToPerform,
            amountToSwapTokenA: tokenA.asUnits(amountToSwapOfTokenA),
            amountToSwapTokenB: tokenB.asUnits(amountToSwapOfTokenB),
          }))
        );
        await setOracleData({ ratePerUnitBToA });
        await DCAPairSwapHandler.setInternalBalances(
          (totalAmountToSwapOfTokenA as BigNumber).mul(2),
          (totalAmountToSwapOfTokenB as BigNumber).mul(2)
        );
        nextSwapInfo = await DCAPairSwapHandler.getNextSwapInfo();
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
        expect(nextSwapInfo.platformFeeTokenA).to.equal(platformFeeTokenA);
      });
      then('token b fee is correct', async () => {
        expect(nextSwapInfo.platformFeeTokenB).to.equal(platformFeeTokenB);
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
        const balanceA = await DCAPairSwapHandler.internalBalanceOf(tokenA.address);
        if (tokenToRewardSwapperWith() === tokenA.address) {
          expect(nextSwapInfo.availableToBorrowTokenA).to.be.equal(balanceA.sub(nextSwapInfo.amountToRewardSwapperWith));
        } else {
          expect(nextSwapInfo.availableToBorrowTokenA).to.be.equal(balanceA);
        }
      });
      then('available to borrow token b is correct', async () => {
        const balanceB = await DCAPairSwapHandler.internalBalanceOf(tokenB.address);
        if (tokenToRewardSwapperWith() === tokenB.address) {
          expect(nextSwapInfo.availableToBorrowTokenB).to.be.equal(balanceB.sub(nextSwapInfo.amountToRewardSwapperWith));
        } else {
          expect(nextSwapInfo.availableToBorrowTokenB).to.be.equal(balanceB);
        }
      });
      then('fees are no more than expected', () => {
        const expectedFeesTokenA = APPLY_FEE(totalAmountToSwapOfTokenA as BigNumber);
        const expectedFeesTokenB = APPLY_FEE(totalAmountToSwapOfTokenB as BigNumber);

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
      ratePerUnitBToA: 0.6,
    });

    getNextSwapInfoTest({
      title: 'two intervals, rate per unit is 1:2 and needing token b to be provided externally',
      context: () => DCAPairSwapHandler.addActiveSwapInterval(SWAP_INTERVAL_2),
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
      context: () => DCAPairSwapHandler.addActiveSwapInterval(SWAP_INTERVAL_2),
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
      context: () => DCAPairSwapHandler.addActiveSwapInterval(SWAP_INTERVAL_2),
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
    context?: () => Promise<void>;
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
          await DCAPairSwapHandler.addActiveSwapInterval(interval);
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
        await DCAPairSwapHandler.setBlockTimestamp(blockTimestamp);
        swapper = await (await wallet.generateRandom()).connect(ethers.provider);

        await DCAPairSwapHandler.setNextSwapsToPerform(
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
        await tokenA.mint(DCAPairSwapHandler.address, initialPairBalanceTokenA);
        await tokenB.mint(DCAPairSwapHandler.address, initialPairBalanceTokenB);
        await DCAPairSwapHandler.setInternalBalances(initialPairBalanceTokenA, initialPairBalanceTokenB);
        swapTx = DCAPairSwapHandler.connect(swapper)['swap()']({ gasPrice: 0 });
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
        expect(await tokenA.balanceOf(DCAPairSwapHandler.address)).to.equal(initialPairBalanceTokenA);
      });
      then('pair balance of token B remains the same', async () => {
        expect(await tokenB.balanceOf(DCAPairSwapHandler.address)).to.equal(initialPairBalanceTokenB);
      });
      then('swap was not registered on token a', async () => {
        for (let i = 0; i < nextSwapContext.length; i++) {
          expect(
            await DCAPairSwapHandler.swapAmountDelta(nextSwapContext[i].interval, tokenA.address, nextSwapContext[i].nextSwapToPerform)
          ).to.be.equal(0);
        }
      });
      then('swap was not registered on token b', async () => {
        for (let i = 0; i < nextSwapContext.length; i++) {
          expect(
            await DCAPairSwapHandler.swapAmountDelta(nextSwapContext[i].interval, tokenB.address, nextSwapContext[i].nextSwapToPerform)
          ).to.be.equal(0);
        }
      });
      then('next swap available did not increase', async () => {
        for (let i = 0; i < nextSwapContext.length; i++) {
          expect(await DCAPairSwapHandler.nextSwapAvailable(nextSwapContext[i].interval)).to.equal(0);
        }
      });
      then('performed swaps did not increase', async () => {
        for (let i = 0; i < nextSwapContext.length; i++) {
          expect(await DCAPairSwapHandler.performedSwaps(nextSwapContext[i].interval)).to.equal(0);
        }
      });
      then('active swap intervals remain the same', async () => {
        expect(await DCAPairSwapHandler.activeSwapIntervals()).to.eql([SWAP_INTERVAL].concat(addedSwapIntervals ?? []));
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
        await DCAPairSwapHandler.setNextSwapsToPerform([
          {
            interval: SWAP_INTERVAL,
            swapToPerform: SWAP_TO_PERFORM,
            amountToSwapTokenA: constants.ZERO,
            amountToSwapTokenB: constants.ZERO,
          },
        ]);
        await setOracleData({ ratePerUnitBToA: tokenA.asUnits(1) });

        await DCAPairSwapHandler['swap()']();
      });
      then('swap was not registered on token a', async () => {
        expect(await DCAPairSwapHandler.swapAmountDelta(SWAP_INTERVAL, tokenA.address, SWAP_TO_PERFORM)).to.be.equal(0);
      });
      then('swap was not registered on token b', async () => {
        expect(await DCAPairSwapHandler.swapAmountDelta(SWAP_INTERVAL, tokenB.address, SWAP_TO_PERFORM)).to.be.equal(0);
      });
      then('next swap available did not increase', async () => {
        expect(await DCAPairSwapHandler.nextSwapAvailable(SWAP_INTERVAL)).to.equal(0);
      });
      then('performed swaps did not increase', async () => {
        expect(await DCAPairSwapHandler.performedSwaps(SWAP_INTERVAL)).to.equal(0);
      });
      then('swap interval is removed from active list', async () => {
        expect(await DCAPairSwapHandler.activeSwapIntervals()).to.be.empty;
      });

      thenInternalBalancesAreTheSameAsTokenBalances();
    });
  });

  describe('flash swap', () => {
    const BYTES = ethers.utils.randomBytes(5);
    let DCAPairSwapCallee: Contract;
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

      const DCAPairSwapCalleeContract = await ethers.getContractFactory('contracts/mocks/DCAPairSwapCallee.sol:DCAPairSwapCalleeMock');
      DCAPairSwapCallee = await DCAPairSwapCalleeContract.deploy(calleeInitialBalanceTokenA, calleeInitialBalanceTokenB);
      await tokenA.mint(DCAPairSwapCallee.address, calleeInitialBalanceTokenA);
      await tokenB.mint(DCAPairSwapCallee.address, calleeInitialBalanceTokenB);
      await tokenA.mint(DCAPairSwapHandler.address, pairInitialBalanceTokenA);
      await tokenB.mint(DCAPairSwapHandler.address, pairInitialBalanceTokenB);
      await DCAPairSwapHandler.setInternalBalances(pairInitialBalanceTokenA, pairInitialBalanceTokenB);

      await DCAPairSwapHandler.setNextSwapsToPerform([
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
      } = await DCAPairSwapHandler.getNextSwapInfo());
    });

    when('doing a reentrancy attack via swap', () => {
      let tx: Promise<TransactionResponse>;
      given(async () => {
        const reentrantDCAPairSwapCalleFactory = await ethers.getContractFactory(
          'contracts/mocks/DCAPairSwapCallee.sol:ReentrantDCAPairSwapCalleeMock'
        );
        const reentrantDCAPairSwapCallee = await reentrantDCAPairSwapCalleFactory.deploy();
        await reentrantDCAPairSwapCallee.setAttack((await DCAPairSwapHandler.populateTransaction['swap()']()).data);
        tx = DCAPairSwapHandler['swap(uint256,uint256,address,bytes)'](
          availableToBorrowTokenA,
          availableToBorrowTokenB,
          reentrantDCAPairSwapCallee.address,
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
        const reentrantDCAPairSwapCalleFactory = await ethers.getContractFactory(
          'contracts/mocks/DCAPairSwapCallee.sol:ReentrantDCAPairSwapCalleeMock'
        );
        const reentrantDCAPairSwapCallee = await reentrantDCAPairSwapCalleFactory.deploy();
        await reentrantDCAPairSwapCallee.setAttack(
          (
            await DCAPairSwapHandler.populateTransaction['swap(uint256,uint256,address,bytes)'](
              availableToBorrowTokenA,
              availableToBorrowTokenB,
              reentrantDCAPairSwapCallee.address,
              BYTES
            )
          ).data
        );
        tx = DCAPairSwapHandler['swap(uint256,uint256,address,bytes)'](
          availableToBorrowTokenA,
          availableToBorrowTokenB,
          reentrantDCAPairSwapCallee.address,
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
        tx = DCAPairSwapHandler['swap(uint256,uint256,address,bytes)'](
          availableToBorrowTokenA.add(1),
          availableToBorrowTokenB,
          DCAPairSwapCallee.address,
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
        tx = DCAPairSwapHandler['swap(uint256,uint256,address,bytes)'](
          availableToBorrowTokenA,
          availableToBorrowTokenB.add(1),
          DCAPairSwapCallee.address,
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
        tx = await DCAPairSwapHandler['swap(uint256,uint256,address,bytes)'](
          availableToBorrowTokenA,
          availableToBorrowTokenB,
          DCAPairSwapCallee.address,
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
        } = await DCAPairSwapCallee.getLastCall();
        expect(pair).to.equal(DCAPairSwapHandler.address);
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
        const calleeTokenABalance = await tokenA.balanceOf(DCAPairSwapCallee.address);
        const calleeTokenBBalance = await tokenB.balanceOf(DCAPairSwapCallee.address);

        expect(calleeTokenABalance).to.equal(calleeInitialBalanceTokenA.add(amountToRewardSwapperWith));
        expect(calleeTokenBBalance).to.equal(calleeInitialBalanceTokenB.sub(amountToBeProvidedBySwapper));
      });

      then('pair balance is modified correctly', async () => {
        const pairTokenABalance = await tokenA.balanceOf(DCAPairSwapHandler.address);
        const pairTokenBBalance = await tokenB.balanceOf(DCAPairSwapHandler.address);

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
        const sender = await readArgFromEvent(tx, 'Swapped', '_sender');
        const to = await readArgFromEvent(tx, 'Swapped', '_to');
        const amountBorrowedTokenA = await readArgFromEvent(tx, 'Swapped', '_amountBorrowedTokenA');
        const amountBorrowedTokenB = await readArgFromEvent(tx, 'Swapped', '_amountBorrowedTokenB');
        expect(sender).to.equal(owner.address);
        expect(to).to.equal(DCAPairSwapCallee.address);
        expect(amountBorrowedTokenA).to.equal(availableToBorrowTokenA);
        expect(amountBorrowedTokenB).to.equal(availableToBorrowTokenB);
      });

      then('active swap intervals remain the same', async () => {
        expect(await DCAPairSwapHandler.activeSwapIntervals()).to.eql([SWAP_INTERVAL]);
      });

      thenInternalBalancesAreTheSameAsTokenBalances();
    });

    when('more tokens than expected are returned', () => {
      let tx: TransactionResponse;

      given(async () => {
        await DCAPairSwapCallee.returnSpecificAmounts(
          availableToBorrowTokenA.add(1),
          availableToBorrowTokenB.add(amountToBeProvidedBySwapper).add(1)
        );

        tx = await DCAPairSwapHandler['swap(uint256,uint256,address,bytes)'](
          availableToBorrowTokenA,
          availableToBorrowTokenB,
          DCAPairSwapCallee.address,
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
        const pairTokenABalance = await tokenA.balanceOf(DCAPairSwapHandler.address);
        const pairTokenBBalance = await tokenB.balanceOf(DCAPairSwapHandler.address);

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
          await DCAPairSwapCallee.returnSpecificAmounts(amountToReturnTokenA(), amountToReturnTokenB());
          tx = DCAPairSwapHandler['swap(uint256,uint256,address,bytes)'](
            amountToBorrowTokenA(),
            amountToBorrowTokenB(),
            DCAPairSwapCallee.address,
            BYTES
          );
          await behaviours.waitForTxAndNotThrow(tx);
        });

        then('tx is reverted', async () => {
          await expect(tx).to.be.revertedWith('LiquidityNotReturned');
        });

        then('callee state is not modified', async () => {
          const wasCalled = await DCAPairSwapCallee.wasThereACall();
          expect(wasCalled).to.be.false;
        });

        then('callee balance is not modified', async () => {
          const calleeTokenABalance = await tokenA.balanceOf(DCAPairSwapCallee.address);
          const calleeTokenBBalance = await tokenB.balanceOf(DCAPairSwapCallee.address);

          expect(calleeTokenABalance).to.equal(calleeInitialBalanceTokenA);
          expect(calleeTokenBBalance).to.equal(calleeInitialBalanceTokenB);
        });

        then('pair balance is not modified', async () => {
          const pairTokenABalance = await tokenA.balanceOf(DCAPairSwapHandler.address);
          const pairTokenBBalance = await tokenB.balanceOf(DCAPairSwapHandler.address);

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
          await DCAPairSwapHandler.removeActiveSwapInterval(SWAP_INTERVAL);

          for (const { interval, nextAvailable } of intervals) {
            await DCAPairSwapHandler.addActiveSwapInterval(interval);
            await DCAPairSwapHandler.setNextSwapAvailable(interval, nextAvailable);
          }
          await DCAPairSwapHandler.setBlockTimestamp(blockTimestamp);
        });

        then('result is as expected', async () => {
          const result = await DCAPairSwapHandler.secondsUntilNextSwap();
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
          await DCAPairSwapHandler.addActiveSwapInterval(interval);
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
        await DCAPairSwapHandler.setBlockTimestamp(blockTimestamp);

        await DCAPairSwapHandler.setNextSwapsToPerform(
          nextSwapContext.map(({ interval, nextSwapToPerform, amountToSwapOfTokenA, amountToSwapOfTokenB }) => ({
            interval,
            swapToPerform: nextSwapToPerform,
            amountToSwapTokenA: tokenA.asUnits(amountToSwapOfTokenA),
            amountToSwapTokenB: tokenB.asUnits(amountToSwapOfTokenB),
          }))
        );
        await setOracleData({ ratePerUnitBToA });

        await tokenA.transfer(DCAPairSwapHandler.address, initialContractTokenABalance);
        await tokenB.transfer(DCAPairSwapHandler.address, initialContractTokenBBalance);
        await DCAPairSwapHandler.setInternalBalances(initialContractTokenABalance, initialContractTokenBBalance);
        initialSwapperTokenABalance = await tokenA.balanceOf(owner.address);
        initialSwapperTokenBBalance = await tokenB.balanceOf(owner.address);

        // Ideally, this would be done by a smart contract on the same tx as the swap
        if (tokenToBeProvidedBySwapper() === tokenA.address) {
          await tokenA.transfer(DCAPairSwapHandler.address, (amountToBeProvidedBySwapper as BigNumber).add(threshold!));
        } else {
          await tokenB.transfer(DCAPairSwapHandler.address, (amountToBeProvidedBySwapper as BigNumber).add(threshold!));
        }

        swapTx = await DCAPairSwapHandler['swap()']();
      });
      then('token to be provided by swapper needed is provided', async () => {
        if (!tokenToBeProvidedBySwapper) {
          expect(await tokenA.balanceOf(DCAPairSwapHandler.address)).to.equal(
            (initialContractTokenABalance as BigNumber).sub(platformFeeTokenA)
          );
          expect(await tokenB.balanceOf(DCAPairSwapHandler.address)).to.equal(
            (initialContractTokenBBalance as BigNumber).sub(platformFeeTokenB)
          );
        } else if (tokenToBeProvidedBySwapper() === tokenA.address) {
          expect(await tokenA.balanceOf(DCAPairSwapHandler.address)).to.equal(
            (initialContractTokenABalance as BigNumber).add(amountToBeProvidedBySwapper).sub(platformFeeTokenA)
          );
        } else if (tokenToBeProvidedBySwapper() === tokenB.address) {
          expect(await tokenB.balanceOf(DCAPairSwapHandler.address)).to.equal(
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
            value: await tokenA.balanceOf(DCAPairSwapHandler.address),
            to: (initialContractTokenABalance as BigNumber).sub(platformFeeTokenA),
            threshold: threshold!,
          });
          bn.expectToEqualWithThreshold({
            value: await tokenB.balanceOf(DCAPairSwapHandler.address),
            to: (initialContractTokenBBalance as BigNumber).sub(platformFeeTokenB),
            threshold: threshold!,
          });
        } else if (tokenToRewardSwapperWith() === tokenA.address) {
          bn.expectToEqualWithThreshold({
            value: (await tokenA.balanceOf(DCAPairSwapHandler.address)).add(platformFeeTokenA),
            to: (initialContractTokenABalance as BigNumber).sub(amountToRewardSwapperWith),
            threshold: threshold!,
          });
        } else if (tokenToRewardSwapperWith() === tokenB.address) {
          bn.expectToEqualWithThreshold({
            value: (await tokenB.balanceOf(DCAPairSwapHandler.address)).add(platformFeeTokenB),
            to: (initialContractTokenBBalance as BigNumber).sub(amountToRewardSwapperWith),
            threshold: threshold!,
          });
        }
      });
      then('token to reward the swapper (+ fee) is sent to the swapper', async () => {
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
      then('register swaps from tokenA to tokenB with correct information', async () => {
        for (let i = 0; i < nextSwapContext.length; i++) {
          const accumRatesPerUnit = await DCAPairSwapHandler.accumRatesPerUnit(
            nextSwapContext[i].interval,
            tokenA.address,
            nextSwapContext[i].nextSwapToPerform
          );
          expect(await DCAPairSwapHandler.swapAmountAccumulator(nextSwapContext[i].interval, tokenA.address)).to.equal(
            toBN(nextSwapContext[i].amountToSwapOfTokenA, tokenA)
          );
          expect(accumRatesPerUnit).to.not.equal(0);
          expect(accumRatesPerUnit).to.equal(ratePerUnitAToB);
        }
      });
      then('register swaps from tokenB to tokenA with correct information', async () => {
        for (let i = 0; i < nextSwapContext.length; i++) {
          const accumRatesPerUnit = await DCAPairSwapHandler.accumRatesPerUnit(
            nextSwapContext[i].interval,
            tokenB.address,
            nextSwapContext[i].nextSwapToPerform
          );
          expect(await DCAPairSwapHandler.swapAmountAccumulator(nextSwapContext[i].interval, tokenB.address)).to.equal(
            toBN(nextSwapContext[i].amountToSwapOfTokenB, tokenB)
          );
          expect(accumRatesPerUnit).to.equal(ratePerUnitBToA);
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
      then('updates performed swaps', async () => {
        for (let i = 0; i < nextSwapContext.length; i++) {
          expect(await DCAPairSwapHandler.performedSwaps(nextSwapContext[i].interval)).to.equal(nextSwapContext[i].nextSwapToPerform);
        }
      });
      then('updates next swap available timestamp', async () => {
        for (let i = 0; i < nextSwapContext.length; i++) {
          const nextTimestamp = (Math.floor(blockTimestamp! / nextSwapContext[i].interval) + 1) * nextSwapContext[i].interval;
          expect(await DCAPairSwapHandler.nextSwapAvailable(nextSwapContext[i].interval)).to.equal(nextTimestamp);
        }
      });
      then('emits event with correct information', async () => {
        const nextSwapInformation = (await readArgFromEvent(swapTx, 'Swapped', '_nextSwapInformation')) as NextSwapInfo;
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
        const sender = await readArgFromEvent(swapTx, 'Swapped', '_sender');
        const to = await readArgFromEvent(swapTx, 'Swapped', '_to');
        const amountBorrowedTokenA = await readArgFromEvent(swapTx, 'Swapped', '_amountBorrowedTokenA');
        const amountBorrowedTokenB = await readArgFromEvent(swapTx, 'Swapped', '_amountBorrowedTokenB');
        expect(sender).to.equal(owner.address);
        expect(to).to.equal(owner.address);
        expect(amountBorrowedTokenA).to.equal(constants.ZERO);
        expect(amountBorrowedTokenB).to.equal(constants.ZERO);
      });

      then('active swap intervals remain the same', async () => {
        expect(await DCAPairSwapHandler.activeSwapIntervals()).to.eql([SWAP_INTERVAL].concat(addedSwapIntervals ?? []));
      });

      thenInternalBalancesAreTheSameAsTokenBalances(threshold as BigNumber);
    });
  }

  function thenInternalBalancesAreTheSameAsTokenBalances(threshold: BigNumber = BigNumber.from(0)) {
    then('internal balance for token A is as expected', async () => {
      const balance = await tokenA.balanceOf(DCAPairSwapHandler.address);
      const internalBalance = await DCAPairSwapHandler.internalBalanceOf(tokenA.address);
      bn.expectToEqualWithThreshold({
        value: internalBalance,
        to: balance,
        threshold,
      });
    });

    then('internal balance for token B is as expected', async () => {
      const balance = await tokenB.balanceOf(DCAPairSwapHandler.address);
      const internalBalance = await DCAPairSwapHandler.internalBalanceOf(tokenB.address);
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
      platformFeeTokenA = APPLY_FEE(amountToSwapOfTokenA);
      platformFeeTokenB = APPLY_FEE(amountToSwapOfTokenB);
    } else if (amountToSwapBInA.gt(amountToSwapOfTokenA)) {
      tokenToBeProvidedBySwapper = () => tokenA.address;
      tokenToRewardSwapperWith = () => tokenB.address;
      amountToBeProvidedBySwapper = amountToSwapBInA.sub(amountToSwapOfTokenA);
      const amountToBeProvidedInB = amountToBeProvidedBySwapper.mul(ratePerUnitAToB).div(tokenA.magnitude);
      amountToRewardSwapperWith = amountToBeProvidedInB.add(APPLY_FEE(amountToBeProvidedInB));
      platformFeeTokenA = APPLY_FEE(amountToSwapOfTokenA);
      platformFeeTokenB = APPLY_FEE(amountToSwapOfTokenB.sub(amountToBeProvidedInB));
    } else {
      tokenToBeProvidedBySwapper = () => tokenB.address;
      tokenToRewardSwapperWith = () => tokenA.address;
      const amountToSwapAInB = amountToSwapOfTokenA.mul(ratePerUnitAToB).div(tokenA.magnitude);
      amountToBeProvidedBySwapper = amountToSwapAInB.sub(amountToSwapOfTokenB);
      const amountToBeProvidedInA = amountToBeProvidedBySwapper.mul(ratePerUnitBToA).div(tokenB.magnitude);
      amountToRewardSwapperWith = amountToBeProvidedInA.add(APPLY_FEE(amountToBeProvidedInA));
      platformFeeTokenA = APPLY_FEE(amountToSwapOfTokenA.sub(amountToBeProvidedInA));
      platformFeeTokenB = APPLY_FEE(amountToSwapOfTokenB);
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
});
