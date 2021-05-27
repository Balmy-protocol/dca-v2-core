import moment from 'moment';
import { expect } from 'chai';
import { BigNumber, Contract, ContractFactory, utils, Wallet } from 'ethers';
import { ethers } from 'hardhat';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { constants, erc20, behaviours, evm, bn, wallet } from '../../utils';
import { given, then, when } from '../../utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { readArgFromEvent } from '../../utils/event-utils';

const MINIMUM_SWAP_INTERVAL = BigNumber.from('60');
const APPLY_FEE = (bn: BigNumber) => bn.mul(3).div(1000);

describe('DCAPairSwapHandler', () => {
  let owner: SignerWithAddress;
  let feeRecipient: SignerWithAddress;
  let tokenA: Contract, tokenB: Contract;
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
      initialAccount: owner.address,
      initialAmount: ethers.constants.MaxUint256.div(2),
    });
    tokenB = await erc20.deploy({
      name: 'tokenB',
      symbol: 'TKN1',
      initialAccount: owner.address,
      initialAmount: ethers.constants.MaxUint256.div(2),
    });
    staticSlidingOracle = await staticSlidingOracleContract.deploy(0, 0);
    DCAGlobalParameters = await DCAGlobalParametersContract.deploy(owner.address, feeRecipient.address);
    DCAPairSwapHandler = await DCAPairSwapHandlerContract.deploy(
      tokenA.address,
      tokenB.address,
      DCAGlobalParameters.address, // global parameters
      staticSlidingOracle.address, // oracle
      swapInterval
    );
  });

  describe('constructor', () => {
    when('swap interval is less than MINIMUM_SWAP_INTERVAL', () => {
      then('reverts with message', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: DCAPairSwapHandlerContract,
          args: [tokenA.address, tokenB.address, DCAGlobalParameters.address, staticSlidingOracle.address, MINIMUM_SWAP_INTERVAL.sub(1)],
          message: 'DCAPair: interval too short',
        });
      });
    });
    when('global parameters is zero', () => {
      then('reverts with message', async () => {
        await behaviours.deployShouldRevertWithZeroAddress({
          contract: DCAPairSwapHandlerContract,
          args: [tokenA.address, tokenB.address, constants.ZERO_ADDRESS, staticSlidingOracle.address, MINIMUM_SWAP_INTERVAL],
        });
      });
    });
    when('oracle is zero', () => {
      then('reverts with message', async () => {
        await behaviours.deployShouldRevertWithZeroAddress({
          contract: DCAPairSwapHandlerContract,
          args: [tokenA.address, tokenB.address, DCAGlobalParameters.address, constants.ZERO_ADDRESS, MINIMUM_SWAP_INTERVAL],
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
          staticSlidingOracle.address,
          MINIMUM_SWAP_INTERVAL
        );
      });

      it('oracle is set correctly', async () => {
        expect(await DCAPairSwapHandler.oracle()).to.equal(staticSlidingOracle.address);
      });

      it('swap interval is set correctly', async () => {
        expect(await DCAPairSwapHandler.swapInterval()).to.equal(MINIMUM_SWAP_INTERVAL);
      });
    });
  });

  function addNewRatePerUnitTest({
    title,
    token,
    previousAccumRatesPerUnit,
    previousAccumRatesPerUnitMultiplier,
    performedSwap,
    ratePerUnit,
  }: {
    title: string;
    token: () => string;
    previousAccumRatesPerUnit: BigNumber | number | string;
    previousAccumRatesPerUnitMultiplier: BigNumber | number | string;
    performedSwap: BigNumber | number | string;
    ratePerUnit: BigNumber | number | string;
  }) {
    const previousAccumRatesPerUnitBN = bn.toBN(previousAccumRatesPerUnit);
    const previousAccumRatesPerUnitMultiplierBN = bn.toBN(previousAccumRatesPerUnitMultiplier);
    const performedSwapBN = bn.toBN(performedSwap);
    const ratePerUnitBN = bn.toBN(ratePerUnit);

    when(title, () => {
      given(async () => {
        await DCAPairSwapHandler.setAcummRatesPerUnit(token(), performedSwapBN.sub(1), [
          previousAccumRatesPerUnitBN,
          previousAccumRatesPerUnitMultiplierBN,
        ]);
        await DCAPairSwapHandler.addNewRatePerUnit(token(), performedSwapBN, ratePerUnit);
      });
      then('increments the rates per unit accumulator base and overflow if needed', async () => {
        const accumRatesPerUnit = await DCAPairSwapHandler.accumRatesPerUnit(token(), performedSwapBN);
        if (previousAccumRatesPerUnitBN.add(ratePerUnitBN).gt(ethers.constants.MaxUint256)) {
          expect(accumRatesPerUnit[0]).to.equal(ratePerUnitBN.sub(ethers.constants.MaxUint256.sub(previousAccumRatesPerUnitBN)));
          expect(accumRatesPerUnit[1]).to.equal(previousAccumRatesPerUnitMultiplierBN.add(1));
        } else {
          expect(accumRatesPerUnit[0]).to.equal(previousAccumRatesPerUnitBN.add(ratePerUnitBN));
          expect(accumRatesPerUnit[1]).to.equal(previousAccumRatesPerUnitMultiplierBN);
        }
      });
    });
  }

  describe('_addNewRatePerUnit', () => {
    addNewRatePerUnitTest({
      title: 'is the first swap of token A',
      token: () => tokenA.address,
      previousAccumRatesPerUnit: 0,
      previousAccumRatesPerUnitMultiplier: 0,
      performedSwap: 1,
      ratePerUnit: 123456789,
    });

    addNewRatePerUnitTest({
      title: 'the addition does not overflow the accumulated rates per unit of token A',
      token: () => tokenA.address,
      previousAccumRatesPerUnit: 123456789,
      previousAccumRatesPerUnitMultiplier: 0,
      performedSwap: 2,
      ratePerUnit: 9991230,
    });

    addNewRatePerUnitTest({
      title: 'previous rate per unit accumulator was too big and overflows token A',
      token: () => tokenA.address,
      previousAccumRatesPerUnit: ethers.constants.MaxUint256.sub('10000'),
      previousAccumRatesPerUnitMultiplier: 0,
      performedSwap: 3,
      ratePerUnit: 9991230,
    });

    addNewRatePerUnitTest({
      title: 'new rate per unit is too big and overflows accumulator of token A',
      token: () => tokenA.address,
      previousAccumRatesPerUnit: 123456789,
      previousAccumRatesPerUnitMultiplier: 0,
      performedSwap: 3,
      ratePerUnit: ethers.constants.MaxUint256.sub('123456'),
    });

    addNewRatePerUnitTest({
      title: 'is the first swap of token B',
      token: () => tokenB.address,
      previousAccumRatesPerUnit: 0,
      previousAccumRatesPerUnitMultiplier: 0,
      performedSwap: 1,
      ratePerUnit: 123456789,
    });
    addNewRatePerUnitTest({
      title: 'the addition does not overflow the accumulated rates per unit of token B',
      token: () => tokenB.address,
      previousAccumRatesPerUnit: 123456789,
      previousAccumRatesPerUnitMultiplier: 0,
      performedSwap: 2,
      ratePerUnit: 9991230,
    });
    addNewRatePerUnitTest({
      title: 'previous rate per unit accumulator was too big and overflows token B',
      token: () => tokenB.address,
      previousAccumRatesPerUnit: ethers.constants.MaxUint256.sub('10000'),
      previousAccumRatesPerUnitMultiplier: 0,
      performedSwap: 3,
      ratePerUnit: 9991230,
    });

    addNewRatePerUnitTest({
      title: 'new rate per unit is too big and overflows accumulator of token B',
      token: () => tokenB.address,
      previousAccumRatesPerUnit: 123456789,
      previousAccumRatesPerUnitMultiplier: 0,
      performedSwap: 3,
      ratePerUnit: ethers.constants.MaxUint256.sub('123456'),
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
        await DCAPairSwapHandler.registerSwap(token(), internalAmountUsedToSwapBN, ratePerUnitBN, performedSwapBN);
      });
      then('sets swap amount accumulator to last internal swap', async () => {
        expect(await DCAPairSwapHandler.swapAmountAccumulator(token())).to.equal(internalAmountUsedToSwapBN);
      });
      then('adds new rate per unit', async () => {
        // expect('_addNewRatePerUnit').to.be.calledOnContractWith(DCAPairSwapHandler, [token(), performedSwapBN, ratePerUnitBN]);
      });
      then('deletes swap amount delta of swap to register', async () => {
        expect(await DCAPairSwapHandler.swapAmountDelta(token(), performedSwapBN)).to.equal(0);
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
    context('when the amount to swap is augmented (swap amount delta is positive)', () => {
      let swapAmountAccumulator = ethers.constants.MaxUint256.div(2);
      let swapAmountDeltas: BigNumber[] = [];
      const getRandomInt = (min: number, max: number): number => Math.floor(Math.random() * (max - min)) + min;

      beforeEach(async () => {
        await DCAPairSwapHandler.setSwapAmountAccumulator(tokenA.address, swapAmountAccumulator);
        for (let i = 1; i <= 10; i++) {
          swapAmountDeltas.push(BigNumber.from(`${getRandomInt(1, 9999999999)}`));
          await DCAPairSwapHandler.setSwapAmountDelta(tokenA.address, BigNumber.from(i), swapAmountDeltas[i - 1]);
        }
      });
      it('returns augments amount to swap', async () => {
        for (let i = 1; i <= 10; i++) {
          expect(await DCAPairSwapHandler.swapAmountAccumulator(tokenA.address)).to.equal(swapAmountAccumulator);
          const amountToSwap = swapAmountAccumulator.add(swapAmountDeltas[i - 1]);
          expect(amountToSwap).to.be.gt(swapAmountAccumulator);
          expect(await DCAPairSwapHandler.getAmountToSwap(tokenA.address, i)).to.equal(amountToSwap);
          await DCAPairSwapHandler.setSwapAmountAccumulator(tokenA.address, amountToSwap);
          swapAmountAccumulator = amountToSwap;
        }
      });
    });
    context('when the amount to swap is reduced (swap amount delta negative)', () => {
      context('and swap delta is type(int256).min', () => {
        const swapAmountAccumulator = constants.MAX_INT_256.add(1);
        const swapAmountDelta = constants.MIN_INT_256;
        const swap = BigNumber.from('1');
        beforeEach(async () => {
          await DCAPairSwapHandler.setSwapAmountAccumulator(tokenA.address, swapAmountAccumulator);
          await DCAPairSwapHandler.setSwapAmountDelta(tokenA.address, swap, swapAmountDelta);
        });
        it('calculates correctly the final amount to buy', async () => {
          expect(await DCAPairSwapHandler.swapAmountAccumulator(tokenA.address)).to.equal(swapAmountAccumulator);
          const amountToSwap = await DCAPairSwapHandler.getAmountToSwap(tokenA.address, swap);
          expect(amountToSwap).to.be.lt(swapAmountAccumulator);
          expect(amountToSwap).to.equal(swapAmountAccumulator.add(swapAmountDelta));
        });
      });
      context('and swap delta is not a extreme parameter', () => {
        let swapAmountAccumulator = ethers.constants.MaxUint256.div(2);
        let swapAmountDeltas: BigNumber[] = [];
        beforeEach(async () => {
          await DCAPairSwapHandler.setSwapAmountAccumulator(tokenA.address, swapAmountAccumulator);
          for (let i = 1; i <= 10; i++) {
            swapAmountDeltas.push(BigNumber.from(`${Math.floor(Math.random() * 1000000) - 999999}`));
            await DCAPairSwapHandler.setSwapAmountDelta(tokenA.address, BigNumber.from(i), swapAmountDeltas[i - 1]);
          }
        });
        it('returns reduced amount to swap', async () => {
          for (let i = 1; i <= 10; i++) {
            expect(await DCAPairSwapHandler.swapAmountAccumulator(tokenA.address)).to.equal(swapAmountAccumulator);
            const amountToSwap = swapAmountAccumulator.add(swapAmountDeltas[i - 1]);
            expect(amountToSwap).to.be.lt(swapAmountAccumulator);
            expect(await DCAPairSwapHandler.getAmountToSwap(tokenA.address, i)).to.equal(amountToSwap);
            await DCAPairSwapHandler.setSwapAmountAccumulator(tokenA.address, amountToSwap);
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
    amountToSwapOfTokenA = bn.toBN(amountToSwapOfTokenA);
    amountToSwapOfTokenB = bn.toBN(amountToSwapOfTokenB);
    ratePerUnitBToA = bn.toBN(ratePerUnitBToA);
    await DCAPairSwapHandler.setPerformedSwaps(nextSwapToPerform.sub(1));
    await DCAPairSwapHandler.setSwapAmountAccumulator(tokenA.address, amountToSwapOfTokenA.div(2));
    await DCAPairSwapHandler.setSwapAmountDelta(tokenA.address, nextSwapToPerform, amountToSwapOfTokenA.div(2));
    await DCAPairSwapHandler.setSwapAmountAccumulator(tokenB.address, amountToSwapOfTokenB.div(2));
    await DCAPairSwapHandler.setSwapAmountDelta(tokenB.address, nextSwapToPerform, amountToSwapOfTokenB.div(2));
    await setOracleData({
      ratePerUnitBToA,
    });
    return calculateSwapDetails(ratePerUnitBToA, amountToSwapOfTokenB, amountToSwapOfTokenA);
  };

  type NextSwapInfo = {
    swapToPerform: BigNumber;
    amountToSwapTokenA: BigNumber;
    amountToSwapTokenB: BigNumber;
    ratePerUnitBToA: BigNumber;
    ratePerUnitAToB: BigNumber;
    platformFeeTokenA: BigNumber;
    platformFeeTokenB: BigNumber;
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
    amountToSwapOfTokenA = bn.toBN(amountToSwapOfTokenA);
    amountToSwapOfTokenB = bn.toBN(amountToSwapOfTokenB);
    ratePerUnitBToA = bn.toBN(ratePerUnitBToA);
    threshold = bn.toBN(threshold ?? 1);
    let {
      ratePerUnitAToB,
      platformFeeTokenA,
      platformFeeTokenB,
      amountToBeProvidedBySwapper,
      amountToRewardSwapperWith,
      tokenToBeProvidedBySwapper,
      tokenToRewardSwapperWith,
    } = calculateSwapDetails(ratePerUnitBToA, amountToSwapOfTokenB, amountToSwapOfTokenA);

    let nextSwapInfo: NextSwapInfo;
    when(title, () => {
      given(async () => {
        await setNextSwapInfo({
          nextSwapToPerform,
          amountToSwapOfTokenA,
          amountToSwapOfTokenB,
          ratePerUnitBToA,
        });
        nextSwapInfo = await DCAPairSwapHandler.getNextSwapInfo();
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
      then('fees are no more than expected', () => {
        const expectedFeesTokenA = APPLY_FEE(amountToSwapOfTokenA as BigNumber);
        const expectedFeesTokenB = APPLY_FEE(amountToSwapOfTokenB as BigNumber);

        let totalFeesTokenA = platformFeeTokenA;
        let totalFeesTokenB = platformFeeTokenB;

        if (tokenToRewardSwapperWith() === tokenA.address) {
          const feesAsRewards = amountToRewardSwapperWith.sub(amountToBeProvidedBySwapper.mul(ratePerUnitBToA).div(BigNumber.from(10).pow(18)));
          totalFeesTokenA = totalFeesTokenA.add(feesAsRewards);
        } else {
          const feesAsRewards = amountToRewardSwapperWith.sub(amountToBeProvidedBySwapper.mul(ratePerUnitAToB).div(BigNumber.from(10).pow(18)));
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
      amountToSwapOfTokenA: utils.parseEther('1.4'),
      amountToSwapOfTokenB: utils.parseEther('1.3'),
      ratePerUnitBToA: utils.parseEther('1'),
    });

    getNextSwapInfoTest({
      title: 'rate per unit is 1:1 and needing token a to be provided externally',
      amountToSwapOfTokenA: utils.parseEther('1'),
      amountToSwapOfTokenB: utils.parseEther('1.3'),
      ratePerUnitBToA: utils.parseEther('1'),
    });

    getNextSwapInfoTest({
      title: 'rate per unit is 1:1 and there is no need to provide tokens externally',
      amountToSwapOfTokenA: utils.parseEther('1'),
      amountToSwapOfTokenB: utils.parseEther('1'),
      ratePerUnitBToA: utils.parseEther('1'),
    });

    getNextSwapInfoTest({
      title: 'rate per unit is 1:2 and needing token b to be provided externally',
      amountToSwapOfTokenA: utils.parseEther('1.4'),
      amountToSwapOfTokenB: utils.parseEther('2.6'),
      ratePerUnitBToA: utils.parseEther('0.5'),
    });

    getNextSwapInfoTest({
      title: 'rate per unit is 1:2 and needing token a to be provided externally',
      amountToSwapOfTokenA: utils.parseEther('1'),
      amountToSwapOfTokenB: utils.parseEther('2.6'),
      ratePerUnitBToA: utils.parseEther('0.5'),
    });

    getNextSwapInfoTest({
      title: 'rate per unit is 1:2 and there is no need to provide tokens externally',
      amountToSwapOfTokenA: utils.parseEther('1'),
      amountToSwapOfTokenB: utils.parseEther('2'),
      ratePerUnitBToA: utils.parseEther('0.5'),
    });

    getNextSwapInfoTest({
      title: 'rate per unit is 3:5 and needing token b to be provided externally',
      amountToSwapOfTokenA: utils.parseEther('1.4'),
      amountToSwapOfTokenB: utils.parseEther('2'),
      ratePerUnitBToA: utils.parseEther('0.6'),
      threshold: 2,
    });

    getNextSwapInfoTest({
      title: 'rate per unit is 3:5 and needing token a to be provided externally',
      amountToSwapOfTokenA: utils.parseEther('1'),
      amountToSwapOfTokenB: utils.parseEther('5'),
      ratePerUnitBToA: utils.parseEther('0.6'),
    });

    // TODO: This requires external stuff because of DUST we must set a possible slippage to avoid not executing internally
    // because of dust ?

    // getNextSwapInfoTest({
    //   title: 'when rate per unit is 3:5 and there is no need to provide tokens externally',
    //   nextSwapToPerform: BigNumber.from('2'),
    //   amountToSwapOfTokenA: utils.parseEther('6'),
    //   amountToSwapOfTokenB: utils.parseEther('10'),
    //   ratePerUnitAToB: utils.parseEther('1.66666666667'),
    //   amountToBeProvidedExternally: utils.parseEther('0'),
    //   tokenToBeProvidedExternally: () => constants.ZERO_ADDRESS
    // });
  });

  const swapTestFailed = ({
    title,
    nextSwapToPerform,
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
    nextSwapToPerform: BigNumber | number | string;
    lastSwapPerformed: () => BigNumber | number | string;
    initialSwapperBalanceTokenA: BigNumber | number | string;
    initialSwapperBalanceTokenB: BigNumber | number | string;
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
      let staticLastSwapPerformed = lastSwapPerformed();
      given(async () => {
        initialPairBalanceTokenA = initialPairBalanceTokenA ?? BigNumber.from(0);
        initialPairBalanceTokenB = initialPairBalanceTokenB ?? BigNumber.from(0);

        swapper = await (await wallet.generateRandom()).connect(ethers.provider);
        await DCAPairSwapHandler.setLastSwapPerformed(staticLastSwapPerformed);
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
        expect(await DCAPairSwapHandler.swapAmountDelta(tokenA.address, nextSwapToPerform)).to.not.be.equal(0);
      });
      then('swap was not registered on token b', async () => {
        expect(await DCAPairSwapHandler.swapAmountDelta(tokenB.address, nextSwapToPerform)).to.not.be.equal(0);
      });
      then('last swap performed did not increase', async () => {
        expect(await DCAPairSwapHandler.lastSwapPerformed()).to.equal(staticLastSwapPerformed);
      });
      then('performed swaps did not increase', async () => {
        expect(await DCAPairSwapHandler.performedSwaps()).to.equal((nextSwapToPerform as BigNumber).sub(1));
      });
      thenInternalBalancesAreTheSameAsTokenBalances();
    });
  };

  describe('swap', () => {
    swapTestFailed({
      title: 'last swap was < than swap interval ago',
      lastSwapPerformed: () => moment().unix() + swapInterval,
      nextSwapToPerform: 2,
      initialSwapperBalanceTokenA: utils.parseEther('1'),
      initialSwapperBalanceTokenB: utils.parseEther('1'),
      amountToSwapOfTokenA: utils.parseEther('1'),
      amountToSwapOfTokenB: utils.parseEther('1'),
      ratePerUnitBToA: utils.parseEther('1'),
      reason: 'DCAPair: within swap interval',
    });

    swapTestFailed({
      title: 'external amount of token a to be provided is approved but swapper does not own',
      lastSwapPerformed: () => moment().unix() - swapInterval,
      nextSwapToPerform: 2,
      initialSwapperBalanceTokenA: utils.parseEther('1').sub(1),
      initialSwapperBalanceTokenB: utils.parseEther('0'),
      amountToSwapOfTokenA: utils.parseEther('1'),
      amountToSwapOfTokenB: utils.parseEther('2'),
      ratePerUnitBToA: utils.parseEther('1'),
      reason: 'ERC20: transfer amount exceeds balance',
    });

    swapTestFailed({
      title: 'external amount of token b to be provided is not approved',
      lastSwapPerformed: () => moment().unix() - swapInterval,
      nextSwapToPerform: 2,
      initialSwapperBalanceTokenA: utils.parseEther('0'),
      initialSwapperBalanceTokenB: utils.parseEther('1').sub(1),
      amountToSwapOfTokenA: utils.parseEther('2'),
      amountToSwapOfTokenB: utils.parseEther('1'),
      ratePerUnitBToA: utils.parseEther('1'),
      reason: 'ERC20: transfer amount exceeds balance',
    });

    swapTestFailed({
      title: 'external amount of token b to be provided is approved but swapper does not own',
      lastSwapPerformed: () => moment().unix() - swapInterval,
      nextSwapToPerform: 2,
      initialSwapperBalanceTokenA: utils.parseEther('0'),
      initialSwapperBalanceTokenB: utils.parseEther('1').sub(1),
      amountToSwapOfTokenA: utils.parseEther('2'),
      amountToSwapOfTokenB: utils.parseEther('1'),
      ratePerUnitBToA: utils.parseEther('1'),
      reason: 'ERC20: transfer amount exceeds balance',
    });

    swapTestFailed({
      title: 'pair swap handler does not own the amount of token to reward swapper with',
      lastSwapPerformed: () => moment().unix() - swapInterval,
      nextSwapToPerform: 2,
      initialSwapperBalanceTokenA: utils.parseEther('0'),
      initialSwapperBalanceTokenB: utils.parseEther('1'),
      amountToSwapOfTokenA: utils.parseEther('2'),
      amountToSwapOfTokenB: utils.parseEther('1'),
      ratePerUnitBToA: utils.parseEther('1'),
      reason: 'ERC20: transfer amount exceeds balance',
    });

    swapTest({
      title: 'rate per unit is 1:1 and needing token b to be provided externally',
      nextSwapToPerform: 2,
      initialContractTokenABalance: utils.parseEther('100'),
      initialContractTokenBBalance: utils.parseEther('100'),
      amountToSwapOfTokenA: utils.parseEther('1.4'),
      amountToSwapOfTokenB: utils.parseEther('1.3'),
      ratePerUnitBToA: utils.parseEther('1'),
    });

    swapTest({
      title: 'rate per unit is 1:1 and needing token a to be provided externally',
      nextSwapToPerform: 2,
      initialContractTokenABalance: utils.parseEther('100'),
      initialContractTokenBBalance: utils.parseEther('100'),
      amountToSwapOfTokenA: utils.parseEther('1'),
      amountToSwapOfTokenB: utils.parseEther('1.3'),
      ratePerUnitBToA: utils.parseEther('1'),
    });

    swapTest({
      title: 'rate per unit is 1:1 and there is no need to provide tokens externally',
      nextSwapToPerform: 2,
      initialContractTokenABalance: utils.parseEther('100'),
      initialContractTokenBBalance: utils.parseEther('100'),
      amountToSwapOfTokenA: utils.parseEther('1'),
      amountToSwapOfTokenB: utils.parseEther('1'),
      ratePerUnitBToA: utils.parseEther('1'),
    });

    swapTest({
      title: 'rate per unit is 1:2 and needing token b to be provided externally',
      nextSwapToPerform: 2,
      initialContractTokenABalance: utils.parseEther('100'),
      initialContractTokenBBalance: utils.parseEther('100'),
      amountToSwapOfTokenA: utils.parseEther('1.4'),
      amountToSwapOfTokenB: utils.parseEther('2.6'),
      ratePerUnitBToA: utils.parseEther('0.5'),
    });

    swapTest({
      title: 'rate per unit is 1:2 and needing token a to be provided externally',
      nextSwapToPerform: 2,
      initialContractTokenABalance: utils.parseEther('100'),
      initialContractTokenBBalance: utils.parseEther('100'),
      amountToSwapOfTokenA: utils.parseEther('1'),
      amountToSwapOfTokenB: utils.parseEther('2.6'),
      ratePerUnitBToA: utils.parseEther('0.5'),
    });

    swapTest({
      title: 'rate per unit is 1:2 and there is no need to provide tokens externally',
      nextSwapToPerform: 2,
      initialContractTokenABalance: utils.parseEther('100'),
      initialContractTokenBBalance: utils.parseEther('100'),
      amountToSwapOfTokenA: utils.parseEther('1'),
      amountToSwapOfTokenB: utils.parseEther('2'),
      ratePerUnitBToA: utils.parseEther('0.5'),
    });

    swapTest({
      title: 'rate per unit is 3:5 and needing token b to be provided externally',
      nextSwapToPerform: 2,
      initialContractTokenABalance: utils.parseEther('100'),
      initialContractTokenBBalance: utils.parseEther('100'),
      amountToSwapOfTokenA: utils.parseEther('1.4'),
      amountToSwapOfTokenB: utils.parseEther('2'),
      ratePerUnitBToA: utils.parseEther('0.6'),
      threshold: 2,
    });

    swapTest({
      title: 'rate per unit is 3:5 and needing token a to be provided externally',
      nextSwapToPerform: 2,
      initialContractTokenABalance: utils.parseEther('100'),
      initialContractTokenBBalance: utils.parseEther('100'),
      amountToSwapOfTokenA: utils.parseEther('1'),
      amountToSwapOfTokenB: utils.parseEther('5'),
      ratePerUnitBToA: utils.parseEther('0.6'),
    });

    // TODO: This requires external stuff because of DUST we must set a possible slippage to avoid not executing internally
    // because of dust ?

    // swapTest({
    //   title: 'when rate per unit is 3:5 and there is no need to provide tokens externally',
    //   nextSwapToPerform: 2,
    //   amountToSwapOfTokenA: utils.parseEther('6'),
    //   amountToSwapOfTokenB: utils.parseEther('10'),
    //   ratePerUnitBToA: utils.parseEther('0.600000000024'),
    //   ratePerUnitAToB: utils.parseEther('1.66666666667'),
    //   amountToBeProvidedExternally: 0,
    //   tokenToBeProvidedExternally: () => constants.ZERO_ADDRESS,
    // });
  });

  describe('flash swap', () => {
    const BYTES = ethers.utils.randomBytes(5);
    const [CALLEE_TOKEN_A_INITIAL_BALANCE, CALLEE_TOKEN_B_INITIAL_BALANCE] = [utils.parseEther('2'), utils.parseEther('2')];
    const [PAIR_TOKEN_A_INITIAL_BALANCE, PAIR_TOKEN_B_INITIAL_BALANCE] = [utils.parseEther('2'), utils.parseEther('2')];
    let DCAPairSwapCallee: Contract;
    let amountToBeProvidedBySwapper: BigNumber, amountToRewardSwapperWith: BigNumber, platformFeeTokenA: BigNumber, platformFeeTokenB: BigNumber;

    given(async () => {
      const DCAPairSwapCalleeContract = await ethers.getContractFactory('contracts/mocks/DCAPairSwapCallee.sol:DCAPairSwapCalleeMock');
      DCAPairSwapCallee = await DCAPairSwapCalleeContract.deploy();
      await tokenA.mint(DCAPairSwapCallee.address, CALLEE_TOKEN_A_INITIAL_BALANCE);
      await tokenB.mint(DCAPairSwapCallee.address, CALLEE_TOKEN_B_INITIAL_BALANCE);
      await tokenA.mint(DCAPairSwapHandler.address, PAIR_TOKEN_A_INITIAL_BALANCE);
      await tokenB.mint(DCAPairSwapHandler.address, PAIR_TOKEN_B_INITIAL_BALANCE);
      await DCAPairSwapHandler.setInternalBalances(PAIR_TOKEN_A_INITIAL_BALANCE, PAIR_TOKEN_B_INITIAL_BALANCE);
      ({ amountToBeProvidedBySwapper, amountToRewardSwapperWith, platformFeeTokenA, platformFeeTokenB } = await setNextSwapInfo({
        nextSwapToPerform: 2,
        amountToSwapOfTokenA: utils.parseEther('2'),
        amountToSwapOfTokenB: utils.parseEther('1'),
        ratePerUnitBToA: utils.parseEther('1'),
      }));
    });

    when('flash swaps are used', () => {
      given(async () => {
        await DCAPairSwapHandler['swap(address,bytes)'](DCAPairSwapCallee.address, BYTES);
      });

      then('callee is called', async () => {
        const { pair, sender, rewardToken, rewardAmount, tokenToProvide, amountToProvide, data } = await DCAPairSwapCallee.getLastCall();
        expect(pair).to.equal(DCAPairSwapHandler.address);
        expect(sender).to.equal(owner.address);
        expect(rewardToken).to.equal(tokenA.address);
        expect(rewardAmount).to.equal(amountToRewardSwapperWith);
        expect(tokenToProvide).to.equal(tokenB.address);
        expect(amountToProvide).to.equal(amountToBeProvidedBySwapper);
        expect(data).to.equal(ethers.utils.hexlify(BYTES));
      });

      then('callee balance is modified correctly', async () => {
        const calleeTokenABalance = await tokenA.balanceOf(DCAPairSwapCallee.address);
        const calleeTokenBBalance = await tokenB.balanceOf(DCAPairSwapCallee.address);

        expect(calleeTokenABalance).to.equal(CALLEE_TOKEN_A_INITIAL_BALANCE.add(amountToRewardSwapperWith));
        expect(calleeTokenBBalance).to.equal(CALLEE_TOKEN_B_INITIAL_BALANCE.sub(amountToBeProvidedBySwapper));
      });

      then('pair balance is modified correctly', async () => {
        const pairTokenABalance = await tokenA.balanceOf(DCAPairSwapHandler.address);
        const pairTokenBBalance = await tokenB.balanceOf(DCAPairSwapHandler.address);

        expect(pairTokenABalance).to.equal(PAIR_TOKEN_A_INITIAL_BALANCE.sub(amountToRewardSwapperWith).sub(platformFeeTokenA));
        expect(pairTokenBBalance).to.equal(PAIR_TOKEN_B_INITIAL_BALANCE.add(amountToBeProvidedBySwapper).sub(platformFeeTokenB));
      });

      thenInternalBalancesAreTheSameAsTokenBalances();
    });

    when('flash swaps are used but amount is not returned', () => {
      let tx: Promise<TransactionResponse>;

      given(async () => {
        await DCAPairSwapCallee.dontProvideTokens();
        tx = DCAPairSwapHandler['swap(address,bytes)'](DCAPairSwapCallee.address, BYTES);
        await behaviours.waitForTxAndNotThrow(tx);
      });

      then('tx is reverted', async () => {
        await expect(tx).to.be.revertedWith('DCAPair: not enough liquidity');
      });

      then('callee state is not modified', async () => {
        const wasCalled = await DCAPairSwapCallee.wasThereACall();
        expect(wasCalled).to.be.false;
      });

      then('callee balance is not modified', async () => {
        const calleeTokenABalance = await tokenA.balanceOf(DCAPairSwapCallee.address);
        const calleeTokenBBalance = await tokenB.balanceOf(DCAPairSwapCallee.address);

        expect(calleeTokenABalance).to.equal(CALLEE_TOKEN_A_INITIAL_BALANCE);
        expect(calleeTokenBBalance).to.equal(CALLEE_TOKEN_B_INITIAL_BALANCE);
      });

      then('pair balance is not modified', async () => {
        const pairTokenABalance = await tokenA.balanceOf(DCAPairSwapHandler.address);
        const pairTokenBBalance = await tokenB.balanceOf(DCAPairSwapHandler.address);

        expect(pairTokenABalance).to.equal(PAIR_TOKEN_A_INITIAL_BALANCE);
        expect(pairTokenBBalance).to.equal(PAIR_TOKEN_B_INITIAL_BALANCE);
      });

      thenInternalBalancesAreTheSameAsTokenBalances();
    });
  });

  function swapTest({
    title,
    nextSwapToPerform,
    initialContractTokenABalance,
    initialContractTokenBBalance,
    amountToSwapOfTokenA,
    amountToSwapOfTokenB,
    ratePerUnitBToA,
    threshold,
  }: {
    title: string;
    nextSwapToPerform: BigNumber | number | string;
    initialContractTokenABalance: BigNumber | number | string;
    initialContractTokenBBalance: BigNumber | number | string;
    amountToSwapOfTokenA: BigNumber | number | string;
    amountToSwapOfTokenB: BigNumber | number | string;
    ratePerUnitBToA: BigNumber | number | string;
    threshold?: BigNumber | number;
  }) {
    nextSwapToPerform = bn.toBN(nextSwapToPerform);
    initialContractTokenABalance = bn.toBN(initialContractTokenABalance);
    initialContractTokenBBalance = bn.toBN(initialContractTokenBBalance);
    amountToSwapOfTokenA = bn.toBN(amountToSwapOfTokenA);
    amountToSwapOfTokenB = bn.toBN(amountToSwapOfTokenB);
    ratePerUnitBToA = bn.toBN(ratePerUnitBToA);
    threshold = bn.toBN(threshold ?? 1);
    let {
      ratePerUnitAToB,
      platformFeeTokenA,
      platformFeeTokenB,
      amountToBeProvidedBySwapper,
      amountToRewardSwapperWith,
      tokenToBeProvidedBySwapper,
      tokenToRewardSwapperWith,
    } = calculateSwapDetails(ratePerUnitBToA, amountToSwapOfTokenB, amountToSwapOfTokenA);
    let initialSwapperTokenABalance: BigNumber;
    let initialSwapperTokenBBalance: BigNumber;
    let initialLastSwapPerformed: BigNumber;
    let swapTx: TransactionResponse;

    when(title, () => {
      given(async () => {
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
        initialLastSwapPerformed = await DCAPairSwapHandler.lastSwapPerformed();

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
        const accumRatesPerUnit = await DCAPairSwapHandler.accumRatesPerUnit(tokenA.address, nextSwapToPerform);
        expect(await DCAPairSwapHandler.swapAmountAccumulator(tokenA.address)).to.equal(amountToSwapOfTokenA);
        expect(accumRatesPerUnit[0]).to.not.equal(0);
        expect(accumRatesPerUnit[0]).to.equal(ratePerUnitAToB);
      });
      then('register swaps from tokenB to tokenA with correct information', async () => {
        const accumRatesPerUnit = await DCAPairSwapHandler.accumRatesPerUnit(tokenB.address, nextSwapToPerform);
        expect(await DCAPairSwapHandler.swapAmountAccumulator(tokenB.address)).to.equal(amountToSwapOfTokenB);
        expect(accumRatesPerUnit[0]).to.equal(ratePerUnitBToA);
      });
      then('sends token a fee correctly to fee recipient', async () => {
        expect(await tokenA.balanceOf(feeRecipient.address)).to.equal(platformFeeTokenA);
      });
      then('sends token b fee correctly to fee recipient', async () => {
        expect(await tokenB.balanceOf(feeRecipient.address)).to.equal(platformFeeTokenB);
      });
      then('updates performed swaps', async () => {
        expect(await DCAPairSwapHandler.performedSwaps()).to.equal(nextSwapToPerform);
      });
      then('updates last swap performend timestamp', async () => {
        expect(await DCAPairSwapHandler.lastSwapPerformed()).to.be.gt(initialLastSwapPerformed);
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

    const magnitude = BigNumber.from(10).pow(18);
    ratePerUnitAToB = magnitude.pow(2).div(ratePerUnitBToA);
    const amountToSwapBInA = amountToSwapOfTokenB.mul(ratePerUnitBToA).div(magnitude);
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
      const amountToBeProvidedInB = amountToBeProvidedBySwapper.mul(ratePerUnitAToB).div(magnitude);
      amountToRewardSwapperWith = amountToBeProvidedInB.add(APPLY_FEE(amountToBeProvidedInB));
      platformFeeTokenA = APPLY_FEE(amountToSwapOfTokenA);
      platformFeeTokenB = APPLY_FEE(amountToSwapOfTokenB.sub(amountToBeProvidedInB));
    } else {
      tokenToBeProvidedBySwapper = () => tokenB.address;
      tokenToRewardSwapperWith = () => tokenA.address;
      const amountToSwapAInB = amountToSwapOfTokenA.mul(ratePerUnitAToB).div(magnitude);
      amountToBeProvidedBySwapper = amountToSwapAInB.sub(amountToSwapOfTokenB);
      const amountToBeProvidedInA = amountToBeProvidedBySwapper.mul(ratePerUnitBToA).div(magnitude);
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
});
