import moment from 'moment';
import { expect } from 'chai';
import { BigNumber, Contract, ContractFactory, Wallet } from 'ethers';
import { ethers } from 'hardhat';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { constants, erc20, behaviours, evm, bn, wallet } from '../../utils';
import { given, then, when } from '../../utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
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
  const swapInterval = moment.duration(1, 'days').as('seconds');

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
    await DCAGlobalParameters.addSwapIntervalsToAllowedList([swapInterval], ['NULL']);
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
        await DCAPairSwapHandler.setAcummRatesPerUnit(swapInterval, token(), performedSwapBN.sub(1), previousAccumRatesPerUnitBN);
        await DCAPairSwapHandler.addNewRatePerUnit(swapInterval, token(), performedSwapBN, ratePerUnit);
      });
      then('increments the rates per unit accumulator', async () => {
        const accumRatesPerUnit = await DCAPairSwapHandler.accumRatesPerUnit(swapInterval, token(), performedSwapBN);
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
        await DCAPairSwapHandler.registerSwap(swapInterval, token(), internalAmountUsedToSwapBN, ratePerUnitBN, performedSwapBN);
      });
      then('sets swap amount accumulator to last internal swap', async () => {
        expect(await DCAPairSwapHandler.swapAmountAccumulator(swapInterval, token())).to.equal(internalAmountUsedToSwapBN);
      });
      then('adds new rate per unit', async () => {
        // expect('_addNewRatePerUnit').to.be.calledOnContractWith(DCAPairSwapHandler, [token(), performedSwapBN, ratePerUnitBN]);
      });
      then('deletes swap amount delta of swap to register', async () => {
        expect(await DCAPairSwapHandler.swapAmountDelta(swapInterval, token(), performedSwapBN)).to.equal(0);
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
        await DCAPairSwapHandler.setSwapAmountAccumulator(swapInterval, tokenA.address, swapAmountAccumulator);
        for (let i = 1; i <= 10; i++) {
          swapAmountDeltas.push(BigNumber.from(`${getRandomInt(1, 9999999999)}`));
          await DCAPairSwapHandler.setSwapAmountDelta(swapInterval, tokenA.address, BigNumber.from(i), swapAmountDeltas[i - 1]);
        }
      });
      it('returns augments amount to swap', async () => {
        for (let i = 1; i <= 10; i++) {
          expect(await DCAPairSwapHandler.swapAmountAccumulator(swapInterval, tokenA.address)).to.equal(swapAmountAccumulator);
          const amountToSwap = swapAmountAccumulator.add(swapAmountDeltas[i - 1]);
          expect(amountToSwap).to.be.gt(swapAmountAccumulator);
          expect(await DCAPairSwapHandler.getAmountToSwap(swapInterval, tokenA.address, i)).to.equal(amountToSwap);
          await DCAPairSwapHandler.setSwapAmountAccumulator(swapInterval, tokenA.address, amountToSwap);
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
          await DCAPairSwapHandler.setSwapAmountAccumulator(swapInterval, tokenA.address, swapAmountAccumulator);
          await DCAPairSwapHandler.setSwapAmountDelta(swapInterval, tokenA.address, swap, swapAmountDelta);
        });
        it('calculates correctly the final amount to buy', async () => {
          expect(await DCAPairSwapHandler.swapAmountAccumulator(swapInterval, tokenA.address)).to.equal(swapAmountAccumulator);
          const amountToSwap = await DCAPairSwapHandler.getAmountToSwap(swapInterval, tokenA.address, swap);
          expect(amountToSwap).to.be.lt(swapAmountAccumulator);
          expect(amountToSwap).to.equal(swapAmountAccumulator.add(swapAmountDelta));
        });
      });
      context('and swap delta is not a extreme parameter', () => {
        let swapAmountAccumulator = ethers.constants.MaxUint256.div(2);
        let swapAmountDeltas: BigNumber[] = [];
        beforeEach(async () => {
          await DCAPairSwapHandler.setSwapAmountAccumulator(swapInterval, tokenA.address, swapAmountAccumulator);
          for (let i = 1; i <= 10; i++) {
            swapAmountDeltas.push(BigNumber.from(`${Math.floor(Math.random() * 1000000) - 999999}`));
            await DCAPairSwapHandler.setSwapAmountDelta(swapInterval, tokenA.address, BigNumber.from(i), swapAmountDeltas[i - 1]);
          }
        });
        it('returns reduced amount to swap', async () => {
          for (let i = 1; i <= 10; i++) {
            expect(await DCAPairSwapHandler.swapAmountAccumulator(swapInterval, tokenA.address)).to.equal(swapAmountAccumulator);
            const amountToSwap = swapAmountAccumulator.add(swapAmountDeltas[i - 1]);
            expect(amountToSwap).to.be.lt(swapAmountAccumulator);
            expect(await DCAPairSwapHandler.getAmountToSwap(swapInterval, tokenA.address, i)).to.equal(amountToSwap);
            await DCAPairSwapHandler.setSwapAmountAccumulator(swapInterval, tokenA.address, amountToSwap);
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

  const setNextSwapInfo = async ({
    nextSwapToPerform,
    amountToSwapOfTokenA,
    amountToSwapOfTokenB,
    ratePerUnitBToA,
  }: {
    nextSwapToPerform: BigNumber | number | string;
    amountToSwapOfTokenA: BigNumber | number | string;
    amountToSwapOfTokenB: BigNumber | number | string;
    ratePerUnitBToA: BigNumber | number | string;
  }) => {
    nextSwapToPerform = bn.toBN(nextSwapToPerform);
    amountToSwapOfTokenA = toBN(amountToSwapOfTokenA, tokenA);
    amountToSwapOfTokenB = toBN(amountToSwapOfTokenB, tokenB);
    ratePerUnitBToA = toBN(ratePerUnitBToA, tokenA);
    await DCAPairSwapHandler.setPerformedSwaps(swapInterval, nextSwapToPerform.sub(1));
    await DCAPairSwapHandler.setSwapAmountAccumulator(swapInterval, tokenA.address, amountToSwapOfTokenA.div(2));
    await DCAPairSwapHandler.setSwapAmountDelta(swapInterval, tokenA.address, nextSwapToPerform, amountToSwapOfTokenA.div(2));
    await DCAPairSwapHandler.setSwapAmountAccumulator(swapInterval, tokenB.address, amountToSwapOfTokenB.div(2));
    await DCAPairSwapHandler.setSwapAmountDelta(swapInterval, tokenB.address, nextSwapToPerform, amountToSwapOfTokenB.div(2));
    await setOracleData({
      ratePerUnitBToA,
    });
  };

  type NextSwapInfo = {
    swapToPerform: BigNumber;
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

  function getNextSwapInfoTest({
    title,
    amountToSwapOfTokenA,
    amountToSwapOfTokenB,
    ratePerUnitBToA,
    threshold,
  }: {
    title: string;
    amountToSwapOfTokenA: BigNumber | number | string;
    amountToSwapOfTokenB: BigNumber | number | string;
    ratePerUnitBToA: BigNumber | number | string;
    threshold?: BigNumber | number;
  }) {
    const nextSwapToPerform = bn.toBN(2);

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
        amountToSwapOfTokenA = toBN(amountToSwapOfTokenA, tokenA);
        amountToSwapOfTokenB = toBN(amountToSwapOfTokenB, tokenB);
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
        } = calculateSwapDetails(ratePerUnitBToA, amountToSwapOfTokenB, amountToSwapOfTokenA));
        await setNextSwapInfo({
          nextSwapToPerform,
          amountToSwapOfTokenA,
          amountToSwapOfTokenB,
          ratePerUnitBToA,
        });
        await DCAPairSwapHandler.setInternalBalances((amountToSwapOfTokenA as BigNumber).mul(2), (amountToSwapOfTokenB as BigNumber).mul(2));
        nextSwapInfo = await DCAPairSwapHandler.getNextSwapInfo(swapInterval);
      });
      then('swap to perform is current + 1', () => {
        expect(nextSwapInfo.swapToPerform).to.equal(nextSwapToPerform);
      });
      then('amount to swap of token A is correct', () => {
        expect(nextSwapInfo.amountToSwapTokenA).to.equal(amountToSwapOfTokenA);
      });
      then('amount to swap of token B is correct', () => {
        expect(nextSwapInfo.amountToSwapTokenB).to.equal(amountToSwapOfTokenB);
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
        const expectedFeesTokenA = APPLY_FEE(amountToSwapOfTokenA as BigNumber);
        const expectedFeesTokenB = APPLY_FEE(amountToSwapOfTokenB as BigNumber);

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
      title: 'rate per unit is 1:1 and needing token b to be provided externally',
      amountToSwapOfTokenA: 1.4,
      amountToSwapOfTokenB: 1.3,
      ratePerUnitBToA: 1,
    });

    getNextSwapInfoTest({
      title: 'rate per unit is 1:1 and needing token a to be provided externally',
      amountToSwapOfTokenA: 1,
      amountToSwapOfTokenB: 1.3,
      ratePerUnitBToA: 1,
    });

    getNextSwapInfoTest({
      title: 'rate per unit is 1:1 and there is no need to provide tokens externally',
      amountToSwapOfTokenA: 1,
      amountToSwapOfTokenB: 1,
      ratePerUnitBToA: 1,
    });

    getNextSwapInfoTest({
      title: 'rate per unit is 1:2 and needing token b to be provided externally',
      amountToSwapOfTokenA: 1.4,
      amountToSwapOfTokenB: 2.6,
      ratePerUnitBToA: 0.5,
    });

    getNextSwapInfoTest({
      title: 'rate per unit is 1:2 and needing token a to be provided externally',
      amountToSwapOfTokenA: 1,
      amountToSwapOfTokenB: 2.6,
      ratePerUnitBToA: 0.5,
    });

    getNextSwapInfoTest({
      title: 'rate per unit is 1:2 and there is no need to provide tokens externally',
      amountToSwapOfTokenA: 1,
      amountToSwapOfTokenB: 2,
      ratePerUnitBToA: 0.5,
    });

    getNextSwapInfoTest({
      title: 'rate per unit is 3:5 and needing token b to be provided externally',
      amountToSwapOfTokenA: 1.4,
      amountToSwapOfTokenB: 2,
      ratePerUnitBToA: 0.6,
      threshold: 2,
    });

    getNextSwapInfoTest({
      title: 'rate per unit is 3:5 and needing token a to be provided externally',
      amountToSwapOfTokenA: 1,
      amountToSwapOfTokenB: 5,
      ratePerUnitBToA: 0.6,
    });
  });

  const swapTestFailed = ({
    title,
    context,
    nextSwapToPerform,
    blockTimestamp,
    lastSwapPerformed,
    initialSwapperBalanceTokenA,
    initialSwapperBalanceTokenB,
    amountToSwapOfTokenA,
    amountToSwapOfTokenB,
    ratePerUnitBToA,
    initialPairBalanceTokenA,
    initialPairBalanceTokenB,
    reason,
  }: {
    title: string;
    context?: () => Promise<void>;
    nextSwapToPerform: BigNumber | number | string;
    blockTimestamp?: number;
    lastSwapPerformed?: number;
    initialSwapperBalanceTokenA: BigNumber | number | string | (() => BigNumber | number | string);
    initialSwapperBalanceTokenB: BigNumber | number | string | (() => BigNumber | number | string);
    amountToSwapOfTokenA: BigNumber | number | string;
    amountToSwapOfTokenB: BigNumber | number | string;
    ratePerUnitBToA: BigNumber | number | string;
    initialPairBalanceTokenA?: BigNumber | number | string;
    initialPairBalanceTokenB?: BigNumber | number | string;
    reason: string;
  }) => {
    nextSwapToPerform = bn.toBN(nextSwapToPerform);
    when(title, () => {
      let swapper: Wallet;
      let swapTx: Promise<TransactionResponse>;
      let staticLastSwapPerformed: number;
      given(async () => {
        staticLastSwapPerformed = lastSwapPerformed ?? 0;
        if (context) {
          await context();
        }
        initialSwapperBalanceTokenA =
          typeof initialSwapperBalanceTokenA === 'function' ? initialSwapperBalanceTokenA() : initialSwapperBalanceTokenA;
        initialSwapperBalanceTokenB =
          typeof initialSwapperBalanceTokenB === 'function' ? initialSwapperBalanceTokenB() : initialSwapperBalanceTokenB;
        initialSwapperBalanceTokenA = toBN(initialSwapperBalanceTokenA, tokenA);
        initialSwapperBalanceTokenB = toBN(initialSwapperBalanceTokenB, tokenB);
        amountToSwapOfTokenA = toBN(amountToSwapOfTokenA, tokenA);
        amountToSwapOfTokenB = toBN(amountToSwapOfTokenB, tokenB);
        initialPairBalanceTokenA = initialPairBalanceTokenA !== undefined ? toBN(initialPairBalanceTokenA, tokenA) : amountToSwapOfTokenA;
        initialPairBalanceTokenB = initialPairBalanceTokenB !== undefined ? toBN(initialPairBalanceTokenB, tokenB) : amountToSwapOfTokenB;
        ratePerUnitBToA = toBN(ratePerUnitBToA, tokenA);
        if (blockTimestamp) {
          await DCAPairSwapHandler.setBlockTimestamp(blockTimestamp);
        }
        swapper = await (await wallet.generateRandom()).connect(ethers.provider);
        await DCAPairSwapHandler.setLastSwapPerformed(swapInterval, staticLastSwapPerformed);
        await setNextSwapInfo({
          nextSwapToPerform,
          amountToSwapOfTokenA,
          amountToSwapOfTokenB,
          ratePerUnitBToA,
        });
        await tokenA.transfer(swapper.address, initialSwapperBalanceTokenA);
        await tokenB.transfer(swapper.address, initialSwapperBalanceTokenB);
        await tokenA.mint(DCAPairSwapHandler.address, initialPairBalanceTokenA);
        await tokenB.mint(DCAPairSwapHandler.address, initialPairBalanceTokenB);
        await DCAPairSwapHandler.setInternalBalances(initialPairBalanceTokenA, initialPairBalanceTokenB);
        swapTx = DCAPairSwapHandler.connect(swapper)['swap(uint32)'](swapInterval, { gasPrice: 0 });
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
        expect(await DCAPairSwapHandler.swapAmountDelta(swapInterval, tokenA.address, nextSwapToPerform)).to.not.be.equal(0);
      });
      then('swap was not registered on token b', async () => {
        expect(await DCAPairSwapHandler.swapAmountDelta(swapInterval, tokenB.address, nextSwapToPerform)).to.not.be.equal(0);
      });
      then('last swap performed did not increase', async () => {
        expect(await DCAPairSwapHandler.lastSwapPerformed(swapInterval)).to.equal(staticLastSwapPerformed);
      });
      then('performed swaps did not increase', async () => {
        expect(await DCAPairSwapHandler.performedSwaps(swapInterval)).to.equal((nextSwapToPerform as BigNumber).sub(1));
      });
      thenInternalBalancesAreTheSameAsTokenBalances();
    });
  };

  describe('swap', () => {
    swapTestFailed({
      title: 'last swap was < than swap interval ago',
      lastSwapPerformed: swapInterval * 10,
      blockTimestamp: swapInterval * 11 - 1,
      nextSwapToPerform: 2,
      initialSwapperBalanceTokenA: 1,
      initialSwapperBalanceTokenB: 1,
      amountToSwapOfTokenA: 1,
      amountToSwapOfTokenB: 1,
      ratePerUnitBToA: 1,
      reason: 'WithinInterval',
    });

    swapTestFailed({
      title: 'external amount of token a to be provided is not sent',
      nextSwapToPerform: 2,
      initialSwapperBalanceTokenA: () => tokenA.asUnits(1).sub(1),
      initialSwapperBalanceTokenB: 0,
      amountToSwapOfTokenA: 1,
      amountToSwapOfTokenB: 2,
      ratePerUnitBToA: 1,
      reason: 'LiquidityNotReturned',
    });

    swapTestFailed({
      title: 'external amount of token b to be provided is not sent',
      nextSwapToPerform: 2,
      initialSwapperBalanceTokenA: 0,
      initialSwapperBalanceTokenB: () => tokenB.asUnits(1).sub(1),
      amountToSwapOfTokenA: 2,
      amountToSwapOfTokenB: 1,
      ratePerUnitBToA: 1,
      reason: 'LiquidityNotReturned',
    });

    swapTestFailed({
      title: 'pair swap handler does not own the amount of token to reward swapper with',
      nextSwapToPerform: 2,
      initialSwapperBalanceTokenA: 0,
      initialSwapperBalanceTokenB: 1,
      initialPairBalanceTokenA: 0,
      initialPairBalanceTokenB: 0,
      amountToSwapOfTokenA: 2,
      amountToSwapOfTokenB: 1,
      ratePerUnitBToA: 1,
      reason: `reverted with panic code 0x11 (Arithmetic operation underflowed or overflowed outside of an unchecked block)`,
    });

    swapTestFailed({
      title: 'swapping is paused',
      context: () => DCAGlobalParameters.pause(),
      nextSwapToPerform: 2,
      initialSwapperBalanceTokenA: 0,
      initialSwapperBalanceTokenB: 1,
      amountToSwapOfTokenA: 2,
      amountToSwapOfTokenB: 1,
      ratePerUnitBToA: 1,
      reason: `Paused`,
    });

    swapTest({
      title: 'last swap was recent but on another interval slot',
      nextSwapToPerform: 2,
      lastSwapPerformed: swapInterval * 10 - 1,
      blockTimestamp: swapInterval * 10,
      initialContractTokenABalance: 100,
      initialContractTokenBBalance: 100,
      amountToSwapOfTokenA: 1.4,
      amountToSwapOfTokenB: 1.3,
      ratePerUnitBToA: 1,
    });

    swapTest({
      title: 'rate per unit is 1:1 and needing token b to be provided externally',
      nextSwapToPerform: 2,
      initialContractTokenABalance: 100,
      initialContractTokenBBalance: 100,
      amountToSwapOfTokenA: 1.4,
      amountToSwapOfTokenB: 1.3,
      ratePerUnitBToA: 1,
    });

    swapTest({
      title: 'rate per unit is 1:1 and needing token a to be provided externally',
      nextSwapToPerform: 2,
      initialContractTokenABalance: 100,
      initialContractTokenBBalance: 100,
      amountToSwapOfTokenA: 1,
      amountToSwapOfTokenB: 1.3,
      ratePerUnitBToA: 1,
    });

    swapTest({
      title: 'rate per unit is 1:1 and there is no need to provide tokens externally',
      nextSwapToPerform: 2,
      initialContractTokenABalance: 100,
      initialContractTokenBBalance: 100,
      amountToSwapOfTokenA: 1,
      amountToSwapOfTokenB: 1,
      ratePerUnitBToA: 1,
    });

    swapTest({
      title: 'rate per unit is 1:2 and needing token b to be provided externally',
      nextSwapToPerform: 2,
      initialContractTokenABalance: 100,
      initialContractTokenBBalance: 100,
      amountToSwapOfTokenA: 1.4,
      amountToSwapOfTokenB: 2.6,
      ratePerUnitBToA: 0.5,
    });

    swapTest({
      title: 'rate per unit is 1:2 and needing token a to be provided externally',
      nextSwapToPerform: 2,
      initialContractTokenABalance: 100,
      initialContractTokenBBalance: 100,
      amountToSwapOfTokenA: 1,
      amountToSwapOfTokenB: 2.6,
      ratePerUnitBToA: 0.5,
    });

    swapTest({
      title: 'rate per unit is 1:2 and there is no need to provide tokens externally',
      nextSwapToPerform: 2,
      initialContractTokenABalance: 100,
      initialContractTokenBBalance: 100,
      amountToSwapOfTokenA: 1,
      amountToSwapOfTokenB: 2,
      ratePerUnitBToA: 0.5,
    });

    swapTest({
      title: 'rate per unit is 3:5 and needing token b to be provided externally',
      nextSwapToPerform: 2,
      initialContractTokenABalance: 100,
      initialContractTokenBBalance: 100,
      amountToSwapOfTokenA: 1.4,
      amountToSwapOfTokenB: 2,
      ratePerUnitBToA: 0.6,
      threshold: 2,
    });

    swapTest({
      title: 'rate per unit is 3:5 and needing token a to be provided externally',
      nextSwapToPerform: 2,
      initialContractTokenABalance: 100,
      initialContractTokenBBalance: 100,
      amountToSwapOfTokenA: 1,
      amountToSwapOfTokenB: 5,
      ratePerUnitBToA: 0.6,
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
      await setNextSwapInfo({
        nextSwapToPerform: 2,
        amountToSwapOfTokenA: 2,
        amountToSwapOfTokenB: 1,
        ratePerUnitBToA: 1,
      });
      ({
        amountToBeProvidedBySwapper,
        amountToRewardSwapperWith,
        platformFeeTokenA,
        platformFeeTokenB,
        availableToBorrowTokenA,
        availableToBorrowTokenB,
      } = await DCAPairSwapHandler.getNextSwapInfo(swapInterval));
    });

    when('doing a reentrancy attack via swap', () => {
      let tx: Promise<TransactionResponse>;
      given(async () => {
        const reentrantDCAPairSwapCalleFactory = await ethers.getContractFactory(
          'contracts/mocks/DCAPairSwapCallee.sol:ReentrantDCAPairSwapCalleeMock'
        );
        const reentrantDCAPairSwapCallee = await reentrantDCAPairSwapCalleFactory.deploy();
        await reentrantDCAPairSwapCallee.setAttack((await DCAPairSwapHandler.populateTransaction['swap(uint32)'](swapInterval)).data);
        tx = DCAPairSwapHandler['swap(uint32,uint256,uint256,address,bytes)'](
          swapInterval,
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
            await DCAPairSwapHandler.populateTransaction['swap(uint32,uint256,uint256,address,bytes)'](
              swapInterval,
              availableToBorrowTokenA,
              availableToBorrowTokenB,
              reentrantDCAPairSwapCallee.address,
              BYTES
            )
          ).data
        );
        tx = DCAPairSwapHandler['swap(uint32,uint256,uint256,address,bytes)'](
          swapInterval,
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
        tx = DCAPairSwapHandler['swap(uint32,uint256,uint256,address,bytes)'](
          swapInterval,
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
        tx = DCAPairSwapHandler['swap(uint32,uint256,uint256,address,bytes)'](
          swapInterval,
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
        tx = await DCAPairSwapHandler['swap(uint32,uint256,uint256,address,bytes)'](
          swapInterval,
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
          tx = DCAPairSwapHandler['swap(uint32,uint256,uint256,address,bytes)'](
            swapInterval,
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

  function swapTest({
    title,
    nextSwapToPerform,
    blockTimestamp,
    lastSwapPerformed,
    initialContractTokenABalance,
    initialContractTokenBBalance,
    amountToSwapOfTokenA,
    amountToSwapOfTokenB,
    ratePerUnitBToA,
    threshold,
  }: {
    title: string;
    nextSwapToPerform: BigNumber | number | string;
    blockTimestamp?: number;
    lastSwapPerformed?: number;
    initialContractTokenABalance: BigNumber | number | string;
    initialContractTokenBBalance: BigNumber | number | string;
    amountToSwapOfTokenA: BigNumber | number | string;
    amountToSwapOfTokenB: BigNumber | number | string;
    ratePerUnitBToA: BigNumber | number | string;
    threshold?: BigNumber | number;
  }) {
    threshold = bn.toBN(threshold ?? 1);
    let ratePerUnitAToB: BigNumber;
    let platformFeeTokenA: BigNumber;
    let platformFeeTokenB: BigNumber;
    let amountToBeProvidedBySwapper: BigNumber;
    let amountToRewardSwapperWith: BigNumber;
    let tokenToBeProvidedBySwapper: () => string;
    let tokenToRewardSwapperWith: () => string;
    let initialSwapperTokenABalance: BigNumber;
    let initialSwapperTokenBBalance: BigNumber;
    let initialLastSwapPerformed: BigNumber;
    let swapTx: TransactionResponse;

    when(title, () => {
      given(async () => {
        initialContractTokenABalance = toBN(initialContractTokenABalance, tokenA);
        initialContractTokenBBalance = toBN(initialContractTokenBBalance, tokenB);
        amountToSwapOfTokenA = toBN(amountToSwapOfTokenA, tokenA);
        amountToSwapOfTokenB = toBN(amountToSwapOfTokenB, tokenB);
        ratePerUnitBToA = toBN(ratePerUnitBToA, tokenA);
        ({
          ratePerUnitAToB,
          platformFeeTokenA,
          platformFeeTokenB,
          amountToBeProvidedBySwapper,
          amountToRewardSwapperWith,
          tokenToBeProvidedBySwapper,
          tokenToRewardSwapperWith,
        } = calculateSwapDetails(ratePerUnitBToA, amountToSwapOfTokenB, amountToSwapOfTokenA));
        if (blockTimestamp) {
          await DCAPairSwapHandler.setBlockTimestamp(blockTimestamp);
        }
        await DCAPairSwapHandler.setLastSwapPerformed(swapInterval, lastSwapPerformed ?? 0);
        await setNextSwapInfo({
          nextSwapToPerform,
          amountToSwapOfTokenA,
          amountToSwapOfTokenB,
          ratePerUnitBToA,
        });
        await tokenA.transfer(DCAPairSwapHandler.address, initialContractTokenABalance);
        await tokenB.transfer(DCAPairSwapHandler.address, initialContractTokenBBalance);
        await DCAPairSwapHandler.setInternalBalances(initialContractTokenABalance, initialContractTokenBBalance);
        initialSwapperTokenABalance = await tokenA.balanceOf(owner.address);
        initialSwapperTokenBBalance = await tokenB.balanceOf(owner.address);
        initialLastSwapPerformed = await DCAPairSwapHandler.lastSwapPerformed(swapInterval);

        // Ideally, this would be done by a smart contract on the same tx as the swap
        if (tokenToBeProvidedBySwapper() === tokenA.address) {
          await tokenA.transfer(DCAPairSwapHandler.address, (amountToBeProvidedBySwapper as BigNumber).add(threshold!));
        } else {
          await tokenB.transfer(DCAPairSwapHandler.address, (amountToBeProvidedBySwapper as BigNumber).add(threshold!));
        }

        swapTx = await DCAPairSwapHandler['swap(uint32)'](swapInterval);
      });
      then('token to be provided by swapper needed is provided', async () => {
        if (!tokenToBeProvidedBySwapper) {
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
        } else if (tokenToBeProvidedBySwapper() === tokenA.address) {
          bn.expectToEqualWithThreshold({
            value: (await tokenA.balanceOf(DCAPairSwapHandler.address)).add(platformFeeTokenA),
            to: (initialContractTokenABalance as BigNumber).add(amountToBeProvidedBySwapper),
            threshold: threshold!,
          });
        } else if (tokenToBeProvidedBySwapper() === tokenB.address) {
          bn.expectToEqualWithThreshold({
            value: (await tokenB.balanceOf(DCAPairSwapHandler.address)).add(platformFeeTokenB),
            to: (initialContractTokenBBalance as BigNumber).add(amountToBeProvidedBySwapper),
            threshold: threshold!,
          });
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
        const accumRatesPerUnit = await DCAPairSwapHandler.accumRatesPerUnit(swapInterval, tokenA.address, nextSwapToPerform);
        expect(await DCAPairSwapHandler.swapAmountAccumulator(swapInterval, tokenA.address)).to.equal(amountToSwapOfTokenA);
        expect(accumRatesPerUnit).to.equal(ratePerUnitAToB);
      });
      then('register swaps from tokenB to tokenA with correct information', async () => {
        const accumRatesPerUnit = await DCAPairSwapHandler.accumRatesPerUnit(swapInterval, tokenB.address, nextSwapToPerform);
        expect(await DCAPairSwapHandler.swapAmountAccumulator(swapInterval, tokenB.address)).to.equal(amountToSwapOfTokenB);
        expect(accumRatesPerUnit).to.equal(ratePerUnitBToA);
      });
      then('sends token a fee correctly to fee recipient', async () => {
        expect(await tokenA.balanceOf(feeRecipient.address)).to.equal(platformFeeTokenA);
      });
      then('sends token b fee correctly to fee recipient', async () => {
        expect(await tokenB.balanceOf(feeRecipient.address)).to.equal(platformFeeTokenB);
      });
      then('updates performed swaps', async () => {
        expect(await DCAPairSwapHandler.performedSwaps(swapInterval)).to.equal(nextSwapToPerform);
      });
      then('updates last swap performend timestamp', async () => {
        expect(await DCAPairSwapHandler.lastSwapPerformed(swapInterval)).to.be.gt(initialLastSwapPerformed);
      });
      then('emits event with correct information', async () => {
        const nextSwapInformation = (await readArgFromEvent(swapTx, 'Swapped', '_nextSwapInformation')) as NextSwapInfo;
        expect(nextSwapInformation.swapToPerform).to.equal(nextSwapToPerform);
        bn.expectToEqualWithThreshold({
          value: nextSwapInformation.amountToSwapTokenA,
          to: amountToSwapOfTokenA,
          threshold: threshold!,
        });
        bn.expectToEqualWithThreshold({
          value: nextSwapInformation.amountToSwapTokenB,
          to: amountToSwapOfTokenB,
          threshold: threshold!,
        });
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

  function toBN(amount: BigNumber | string | number, token: TokenContract): BigNumber {
    return BigNumber.isBigNumber(amount) ? amount : token.asUnits(amount);
  }
});
