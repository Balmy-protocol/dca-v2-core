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

describe('DCAPairSwapHandler', () => {
  let owner: SignerWithAddress;
  let feeRecipient: SignerWithAddress;
  let tokenA: Contract, tokenB: Contract;
  let DCAPairSwapHandlerContract: ContractFactory;
  let DCAPairSwapHandler: Contract;
  let staticSlidingOracleContract: ContractFactory;
  let staticSlidingOracle: Contract;
  let DCAFactoryContract: ContractFactory;
  let DCAFactory: Contract;
  const swapInterval = moment.duration(1, 'days').as('seconds');

  before('Setup accounts and contracts', async () => {
    [owner, feeRecipient] = await ethers.getSigners();
    DCAFactoryContract = await ethers.getContractFactory('contracts/mocks/DCAFactory/DCAFactory.sol:DCAFactoryMock');
    DCAPairSwapHandlerContract = await ethers.getContractFactory('contracts/mocks/DCAPair/DCAPairSwapHandler.sol:DCAPairSwapHandlerMock');
    staticSlidingOracleContract = await ethers.getContractFactory('contracts/mocks/StaticSlidingOracle.sol:StaticSlidingOracle');
  });

  beforeEach('Deploy and configure', async () => {
    await evm.reset();
    tokenA = await erc20.deploy({
      name: 'tokenA',
      symbol: 'TKN0',
      initialAccount: owner.address,
      initialAmount: ethers.constants.MaxUint256,
    });
    tokenB = await erc20.deploy({
      name: 'tokenB',
      symbol: 'TKN1',
      initialAccount: owner.address,
      initialAmount: ethers.constants.MaxUint256,
    });
    staticSlidingOracle = await staticSlidingOracleContract.deploy(0, 0);
    DCAFactory = await DCAFactoryContract.deploy(feeRecipient.address);
    DCAPairSwapHandler = await DCAPairSwapHandlerContract.deploy(
      tokenA.address,
      tokenB.address,
      DCAFactory.address, // factory
      staticSlidingOracle.address, // oracle
      swapInterval
    );
  });

  describe('constructor', () => {
    when('swap interval is less than MINIMUM_SWAP_INTERVAL', () => {
      then('reverts with message', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: DCAPairSwapHandlerContract,
          args: [tokenA.address, tokenB.address, DCAFactory.address, staticSlidingOracle.address, MINIMUM_SWAP_INTERVAL.sub(1)],
          message: 'DCAPair: interval too short',
        });
      });
    });
    when('factory is zero', () => {
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
          args: [tokenA.address, tokenB.address, DCAFactory.address, constants.ZERO_ADDRESS, MINIMUM_SWAP_INTERVAL],
        });
      });
    });
    when('all arguments are valid', () => {
      it('initizalizes correctly and emits events', async () => {
        await behaviours.deployShouldSetVariablesAndEmitEvents({
          contract: DCAPairSwapHandlerContract,
          args: [
            tokenA.address,
            tokenB.address,
            DCAFactory.address, // factory
            staticSlidingOracle.address,
            MINIMUM_SWAP_INTERVAL,
          ],
          settersGettersVariablesAndEvents: [
            {
              getterFunc: 'swapInterval',
              variable: MINIMUM_SWAP_INTERVAL,
              eventEmitted: 'SwapIntervalSet',
            },
          ],
        });
      });
    });
  });

  describe('_setOracle', () => {
    let setOracleTx: Promise<TransactionResponse>;
    when('oracle is zero address', () => {
      given(async () => {
        setOracleTx = DCAPairSwapHandler.setOracle(constants.ZERO_ADDRESS);
      });
      then('tx is reverted with reason', async () => {
        await expect(setOracleTx).to.be.revertedWith('DCAPair: zero address');
      });
    });
    when('oracle is a valid address', () => {
      let newOracle: string = constants.NOT_ZERO_ADDRESS;
      given(async () => {
        setOracleTx = DCAPairSwapHandler.setOracle(newOracle);
      });
      then('oracle is set', async () => {
        expect(await DCAPairSwapHandler.oracle()).to.be.equal(newOracle);
      });
      then('event is emitted', async () => {
        await expect(setOracleTx).to.emit(DCAPairSwapHandler, 'OracleSet').withArgs(newOracle);
      });
    });
  });

  describe('_setSwapInterval', () => {
    when('swap interval is less than MINIMUM_SWAP_INTERVAL', () => {
      then('reverts with message', async () => {
        await expect(DCAPairSwapHandler.setSwapInterval(MINIMUM_SWAP_INTERVAL.sub(1))).to.be.revertedWith('DCAPair: interval too short');
      });
    });
    when('swap interval is more than MINIMUM_SWAP_INTERVAL', () => {
      then('sets new value, and emits event with correct args', async () => {
        await behaviours.txShouldSetVariableAndEmitEvent({
          contract: DCAPairSwapHandler,
          getterFunc: 'swapInterval',
          setterFunc: 'setSwapInterval',
          variable: MINIMUM_SWAP_INTERVAL,
          eventEmitted: 'SwapIntervalSet',
        });
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
  };

  type NextSwapInfo = {
    swapToPerform: BigNumber;
    amountToSwapTokenA: BigNumber;
    amountToSwapTokenB: BigNumber;
    ratePerUnitBToA: BigNumber;
    ratePerUnitAToB: BigNumber;
    tokenAFee: BigNumber;
    tokenBFee: BigNumber;
    amountToBeProvidedBySwapper: BigNumber;
    amountToRewardSwapperWith: BigNumber;
    tokenToBeProvidedBySwapper: string;
    tokenToRewardSwapperWith: string;
  };

  function getNextSwapInfoTest({
    title,
    nextSwapToPerform,
    amountToSwapOfTokenA,
    amountToSwapOfTokenB,
    ratePerUnitBToA,
    ratePerUnitAToB,
    tokenAFee,
    tokenBFee,
    amountToBeProvidedBySwapper,
    amountToRewardSwapperWith,
    tokenToBeProvidedBySwapper,
    tokenToRewardSwapperWith,
  }: {
    title: string;
    nextSwapToPerform: BigNumber | number | string;
    amountToSwapOfTokenA: BigNumber | number | string;
    amountToSwapOfTokenB: BigNumber | number | string;
    ratePerUnitBToA: BigNumber | number | string;
    ratePerUnitAToB: BigNumber | number | string;
    tokenAFee: BigNumber | number | string;
    tokenBFee: BigNumber | number | string;
    amountToBeProvidedBySwapper: BigNumber | number | string;
    amountToRewardSwapperWith: BigNumber | number | string;
    tokenToBeProvidedBySwapper: () => string;
    tokenToRewardSwapperWith: () => string;
  }) {
    nextSwapToPerform = bn.toBN(nextSwapToPerform);
    amountToSwapOfTokenA = bn.toBN(amountToSwapOfTokenA);
    amountToSwapOfTokenB = bn.toBN(amountToSwapOfTokenB);
    ratePerUnitBToA = bn.toBN(ratePerUnitBToA);
    ratePerUnitAToB = bn.toBN(ratePerUnitAToB);
    tokenAFee = bn.toBN(tokenAFee);
    tokenBFee = bn.toBN(tokenBFee);
    amountToBeProvidedBySwapper = bn.toBN(amountToBeProvidedBySwapper);
    amountToRewardSwapperWith = bn.toBN(amountToRewardSwapperWith);

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
          threshold: BigNumber.from('1'),
        });
      });
      then('rate of unit a to b is correct', () => {
        bn.expectToEqualWithThreshold({
          value: nextSwapInfo.ratePerUnitAToB,
          to: ratePerUnitAToB,
          threshold: BigNumber.from('1'),
        });
      });
      then('token a fee is correct', async () => {
        expect(nextSwapInfo.tokenAFee).to.equal(tokenAFee);
      });
      then('token b fee is correct', async () => {
        expect(nextSwapInfo.tokenBFee).to.equal(tokenBFee);
      });
      then('the amount of tokens to be provided by swapper is correct', async () => {
        bn.expectToEqualWithThreshold({
          value: nextSwapInfo.amountToBeProvidedBySwapper,
          to: amountToBeProvidedBySwapper,
          threshold: BigNumber.from('1'),
        });
      });
      then('the amount of tokens to reward swapper with is correct', async () => {
        bn.expectToEqualWithThreshold({
          value: nextSwapInfo.amountToRewardSwapperWith,
          to: amountToRewardSwapperWith,
          threshold: BigNumber.from('1'),
        });
      });
      then('token to be provided by swapper is correct', async () => {
        expect(nextSwapInfo.tokenToBeProvidedBySwapper).to.be.equal(tokenToBeProvidedBySwapper());
      });
      then('token to reward swapper with is correct', async () => {
        expect(nextSwapInfo.tokenToRewardSwapperWith).to.be.equal(tokenToRewardSwapperWith());
      });
    });
  }

  describe('getNextSwapInfo', () => {
    getNextSwapInfoTest({
      title: 'rate per unit is 1:1 and needing token b to be provided externally',
      nextSwapToPerform: 2,
      amountToSwapOfTokenA: utils.parseEther('1.4'),
      amountToSwapOfTokenB: utils.parseEther('1.3'),
      ratePerUnitBToA: utils.parseEther('1'),
      ratePerUnitAToB: utils.parseEther('1'),
      tokenAFee: utils.parseEther('0.0028'),
      tokenBFee: utils.parseEther('0.0026'),
      amountToBeProvidedBySwapper: utils.parseEther('0.1'),
      amountToRewardSwapperWith: utils.parseEther('0.1002'),
      tokenToBeProvidedBySwapper: () => tokenB.address,
      tokenToRewardSwapperWith: () => tokenA.address,
    });

    getNextSwapInfoTest({
      title: 'rate per unit is 1:1 and needing token a to be provided externally',
      nextSwapToPerform: 2,
      amountToSwapOfTokenA: utils.parseEther('1'),
      amountToSwapOfTokenB: utils.parseEther('1.3'),
      ratePerUnitBToA: utils.parseEther('1'),
      ratePerUnitAToB: utils.parseEther('1'),
      tokenAFee: utils.parseEther('0.002'),
      tokenBFee: utils.parseEther('0.0026'),
      amountToBeProvidedBySwapper: utils.parseEther('0.3'),
      amountToRewardSwapperWith: utils.parseEther('0.3006'),
      tokenToBeProvidedBySwapper: () => tokenA.address,
      tokenToRewardSwapperWith: () => tokenB.address,
    });

    getNextSwapInfoTest({
      title: 'rate per unit is 1:1 and there is no need to provide tokens externally',
      nextSwapToPerform: 2,
      amountToSwapOfTokenA: utils.parseEther('1'),
      amountToSwapOfTokenB: utils.parseEther('1'),
      ratePerUnitBToA: utils.parseEther('1'),
      ratePerUnitAToB: utils.parseEther('1'),
      tokenAFee: utils.parseEther('0.002'),
      tokenBFee: utils.parseEther('0.002'),
      amountToBeProvidedBySwapper: utils.parseEther('0'),
      amountToRewardSwapperWith: utils.parseEther('0'),
      tokenToBeProvidedBySwapper: () => constants.ZERO_ADDRESS,
      tokenToRewardSwapperWith: () => constants.ZERO_ADDRESS,
    });

    getNextSwapInfoTest({
      title: 'rate per unit is 1:2 and needing token b to be provided externally',
      nextSwapToPerform: 2,
      amountToSwapOfTokenA: utils.parseEther('1.4'),
      amountToSwapOfTokenB: utils.parseEther('2.6'),
      ratePerUnitBToA: utils.parseEther('0.5'),
      ratePerUnitAToB: utils.parseEther('2'),
      tokenAFee: utils.parseEther('0.0028'),
      tokenBFee: utils.parseEther('0.0052'),
      amountToBeProvidedBySwapper: utils.parseEther('0.2'),
      amountToRewardSwapperWith: utils.parseEther('0.1002'),
      tokenToBeProvidedBySwapper: () => tokenB.address,
      tokenToRewardSwapperWith: () => tokenA.address,
    });

    getNextSwapInfoTest({
      title: 'rate per unit is 1:2 and needing token a to be provided externally',
      nextSwapToPerform: 2,
      amountToSwapOfTokenA: utils.parseEther('1'),
      amountToSwapOfTokenB: utils.parseEther('2.6'),
      ratePerUnitBToA: utils.parseEther('0.5'),
      ratePerUnitAToB: utils.parseEther('2'),
      tokenAFee: utils.parseEther('0.002'),
      tokenBFee: utils.parseEther('0.0052'),
      amountToBeProvidedBySwapper: utils.parseEther('0.3'),
      amountToRewardSwapperWith: utils.parseEther('0.6012'),
      tokenToBeProvidedBySwapper: () => tokenA.address,
      tokenToRewardSwapperWith: () => tokenB.address,
    });

    getNextSwapInfoTest({
      title: 'rate per unit is 1:2 and there is no need to provide tokens externally',
      nextSwapToPerform: 2,
      amountToSwapOfTokenA: utils.parseEther('1'),
      amountToSwapOfTokenB: utils.parseEther('2'),
      ratePerUnitBToA: utils.parseEther('0.5'),
      ratePerUnitAToB: utils.parseEther('2'),
      tokenAFee: utils.parseEther('0.002'),
      tokenBFee: utils.parseEther('0.004'),
      amountToBeProvidedBySwapper: utils.parseEther('0'),
      amountToRewardSwapperWith: utils.parseEther('0'),
      tokenToBeProvidedBySwapper: () => constants.ZERO_ADDRESS,
      tokenToRewardSwapperWith: () => constants.ZERO_ADDRESS,
    });

    getNextSwapInfoTest({
      title: 'rate per unit is 3:5 and needing token b to be provided externally',
      nextSwapToPerform: 2,
      amountToSwapOfTokenA: utils.parseEther('1.4'),
      amountToSwapOfTokenB: utils.parseEther('2'),
      ratePerUnitBToA: utils.parseEther('0.6'),
      ratePerUnitAToB: utils.parseEther('1.666666666666666666'),
      tokenAFee: utils.parseEther('0.0028'),
      tokenBFee: utils.parseEther('0.004'),
      amountToBeProvidedBySwapper: utils.parseEther('0.333333333333333332'),
      amountToRewardSwapperWith: utils.parseEther('0.200399999999999999'),
      tokenToBeProvidedBySwapper: () => tokenB.address,
      tokenToRewardSwapperWith: () => tokenA.address,
    });

    getNextSwapInfoTest({
      title: 'rate per unit is 3:5 and needing token a to be provided externally',
      nextSwapToPerform: 2,
      amountToSwapOfTokenA: utils.parseEther('1'),
      amountToSwapOfTokenB: utils.parseEther('5'),
      ratePerUnitBToA: utils.parseEther('0.6'),
      ratePerUnitAToB: utils.parseEther('1.666666666666666666'),
      tokenAFee: utils.parseEther('0.002'),
      tokenBFee: utils.parseEther('0.010'),
      amountToBeProvidedBySwapper: utils.parseEther('2'),
      amountToRewardSwapperWith: utils.parseEther('3.339999999999999998'),
      tokenToBeProvidedBySwapper: () => tokenA.address,
      tokenToRewardSwapperWith: () => tokenB.address,
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
    approvedTokenA,
    initialSwapperBalanceTokenB,
    approvedTokenB,
    amountToSwapOfTokenA,
    amountToSwapOfTokenB,
    ratePerUnitBToA,
    reason,
  }: {
    title: string;
    nextSwapToPerform: BigNumber | number | string;
    lastSwapPerformed: () => BigNumber | number | string;
    initialSwapperBalanceTokenA: BigNumber | number | string;
    approvedTokenA: BigNumber | number | string;
    initialSwapperBalanceTokenB: BigNumber | number | string;
    approvedTokenB: BigNumber | number | string;
    amountToSwapOfTokenA: BigNumber | number | string;
    amountToSwapOfTokenB: BigNumber | number | string;
    ratePerUnitBToA: BigNumber | number | string;
    reason: string;
  }) => {
    nextSwapToPerform = bn.toBN(nextSwapToPerform);
    when(title, () => {
      let swapper: Wallet;
      let initialPairBalanceTokenA: BigNumber;
      let initialPairBalanceTokenB: BigNumber;
      let swapTx: Promise<TransactionResponse>;
      let staticLastSwapPerformed = lastSwapPerformed();
      given(async () => {
        swapper = await (await wallet.generateRandom()).connect(ethers.provider);
        await DCAPairSwapHandler.setLastSwapPerformed(staticLastSwapPerformed);
        await setNextSwapInfo({
          nextSwapToPerform,
          amountToSwapOfTokenA,
          amountToSwapOfTokenB,
          ratePerUnitBToA,
        });
        await tokenA.transfer(await swapper.getAddress(), initialSwapperBalanceTokenA);
        await tokenB.transfer(await swapper.getAddress(), initialSwapperBalanceTokenB);
        await tokenA.connect(swapper).approve(DCAPairSwapHandler.address, approvedTokenA, { gasPrice: 0 });
        await tokenB.connect(swapper).approve(DCAPairSwapHandler.address, approvedTokenB, { gasPrice: 0 });
        initialPairBalanceTokenA = await tokenA.balanceOf(DCAPairSwapHandler.address);
        initialPairBalanceTokenB = await tokenB.balanceOf(DCAPairSwapHandler.address);
        swapTx = DCAPairSwapHandler.connect(swapper).swap({ gasPrice: 0 });
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
    });
  };

  describe('swap', () => {
    swapTestFailed({
      title: 'last swap was < than swap interval ago',
      lastSwapPerformed: () => moment().unix() + swapInterval,
      nextSwapToPerform: 2,
      initialSwapperBalanceTokenA: utils.parseEther('1'),
      approvedTokenA: utils.parseEther('1'),
      initialSwapperBalanceTokenB: utils.parseEther('1'),
      approvedTokenB: utils.parseEther('1'),
      amountToSwapOfTokenA: utils.parseEther('1'),
      amountToSwapOfTokenB: utils.parseEther('1'),
      ratePerUnitBToA: utils.parseEther('1'),
      reason: 'DCAPair: within swap interval',
    });

    swapTestFailed({
      title: 'external amount of token a to be provided is not approved',
      lastSwapPerformed: () => moment().unix() - swapInterval,
      nextSwapToPerform: 2,
      initialSwapperBalanceTokenA: utils.parseEther('1'),
      approvedTokenA: utils.parseEther('1').sub(1),
      initialSwapperBalanceTokenB: utils.parseEther('0'),
      approvedTokenB: utils.parseEther('0'),
      amountToSwapOfTokenA: utils.parseEther('1'),
      amountToSwapOfTokenB: utils.parseEther('2'),
      ratePerUnitBToA: utils.parseEther('1'),
      reason: 'ERC20: transfer amount exceeds allowance',
    });

    swapTestFailed({
      title: 'external amount of token a to be provided is approved but swapper does not own',
      lastSwapPerformed: () => moment().unix() - swapInterval,
      nextSwapToPerform: 2,
      initialSwapperBalanceTokenA: utils.parseEther('1').sub(1),
      approvedTokenA: utils.parseEther('1'),
      initialSwapperBalanceTokenB: utils.parseEther('0'),
      approvedTokenB: utils.parseEther('0'),
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
      approvedTokenA: utils.parseEther('0'),
      initialSwapperBalanceTokenB: utils.parseEther('1'),
      approvedTokenB: utils.parseEther('1').sub(1),
      amountToSwapOfTokenA: utils.parseEther('2'),
      amountToSwapOfTokenB: utils.parseEther('1'),
      ratePerUnitBToA: utils.parseEther('1'),
      reason: 'ERC20: transfer amount exceeds allowance',
    });

    swapTestFailed({
      title: 'external amount of token b to be provided is not approved',
      lastSwapPerformed: () => moment().unix() - swapInterval,
      nextSwapToPerform: 2,
      initialSwapperBalanceTokenA: utils.parseEther('0'),
      approvedTokenA: utils.parseEther('0'),
      initialSwapperBalanceTokenB: utils.parseEther('1').sub(1),
      approvedTokenB: utils.parseEther('1'),
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
      approvedTokenA: utils.parseEther('0'),
      initialSwapperBalanceTokenB: utils.parseEther('1').sub(1),
      approvedTokenB: utils.parseEther('1'),
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
      approvedTokenA: utils.parseEther('0'),
      initialSwapperBalanceTokenB: utils.parseEther('1'),
      approvedTokenB: utils.parseEther('1'),
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
      ratePerUnitAToB: utils.parseEther('1'),
      tokenAFee: utils.parseEther('0.0028'),
      tokenBFee: utils.parseEther('0.0026'),
      amountToBeProvidedBySwapper: utils.parseEther('0.1'),
      amountToRewardSwapperWith: utils.parseEther('0.1002'),
      tokenToBeProvidedBySwapper: () => tokenB,
      tokenToRewardSwapperWith: () => tokenA,
    });

    swapTest({
      title: 'rate per unit is 1:1 and needing token b to be provided externally',
      nextSwapToPerform: 2,
      initialContractTokenABalance: utils.parseEther('100'),
      initialContractTokenBBalance: utils.parseEther('100'),
      amountToSwapOfTokenA: utils.parseEther('1.4'),
      amountToSwapOfTokenB: utils.parseEther('1.3'),
      ratePerUnitBToA: utils.parseEther('1'),
      ratePerUnitAToB: utils.parseEther('1'),
      tokenAFee: utils.parseEther('0.0028'),
      tokenBFee: utils.parseEther('0.0026'),
      amountToBeProvidedBySwapper: utils.parseEther('0.1'),
      amountToRewardSwapperWith: utils.parseEther('0.1002'),
      tokenToBeProvidedBySwapper: () => tokenB,
      tokenToRewardSwapperWith: () => tokenA,
    });

    swapTest({
      title: 'rate per unit is 1:1 and needing token a to be provided externally',
      nextSwapToPerform: 2,
      initialContractTokenABalance: utils.parseEther('100'),
      initialContractTokenBBalance: utils.parseEther('100'),
      amountToSwapOfTokenA: utils.parseEther('1'),
      amountToSwapOfTokenB: utils.parseEther('1.3'),
      ratePerUnitBToA: utils.parseEther('1'),
      ratePerUnitAToB: utils.parseEther('1'),
      tokenAFee: utils.parseEther('0.002'),
      tokenBFee: utils.parseEther('0.0026'),
      amountToBeProvidedBySwapper: utils.parseEther('0.3'),
      amountToRewardSwapperWith: utils.parseEther('0.3006'),
      tokenToBeProvidedBySwapper: () => tokenA,
      tokenToRewardSwapperWith: () => tokenB,
    });

    swapTest({
      title: 'rate per unit is 1:1 and there is no need to provide tokens externally',
      nextSwapToPerform: 2,
      initialContractTokenABalance: utils.parseEther('100'),
      initialContractTokenBBalance: utils.parseEther('100'),
      amountToSwapOfTokenA: utils.parseEther('1'),
      amountToSwapOfTokenB: utils.parseEther('1'),
      ratePerUnitBToA: utils.parseEther('1'),
      ratePerUnitAToB: utils.parseEther('1'),
      tokenAFee: utils.parseEther('0.002'),
      tokenBFee: utils.parseEther('0.002'),
      amountToBeProvidedBySwapper: utils.parseEther('0'),
      amountToRewardSwapperWith: utils.parseEther('0'),
    });

    swapTest({
      title: 'rate per unit is 1:2 and needing token b to be provided externally',
      nextSwapToPerform: 2,
      initialContractTokenABalance: utils.parseEther('100'),
      initialContractTokenBBalance: utils.parseEther('100'),
      amountToSwapOfTokenA: utils.parseEther('1.4'),
      amountToSwapOfTokenB: utils.parseEther('2.6'),
      ratePerUnitBToA: utils.parseEther('0.5'),
      ratePerUnitAToB: utils.parseEther('2'),
      tokenAFee: utils.parseEther('0.0028'),
      tokenBFee: utils.parseEther('0.0052'),
      amountToBeProvidedBySwapper: utils.parseEther('0.2'),
      amountToRewardSwapperWith: utils.parseEther('0.1002'),
      tokenToBeProvidedBySwapper: () => tokenB,
      tokenToRewardSwapperWith: () => tokenA,
    });

    swapTest({
      title: 'rate per unit is 1:2 and needing token a to be provided externally',
      nextSwapToPerform: 2,
      initialContractTokenABalance: utils.parseEther('100'),
      initialContractTokenBBalance: utils.parseEther('100'),
      amountToSwapOfTokenA: utils.parseEther('1'),
      amountToSwapOfTokenB: utils.parseEther('2.6'),
      ratePerUnitBToA: utils.parseEther('0.5'),
      ratePerUnitAToB: utils.parseEther('2'),
      tokenAFee: utils.parseEther('0.002'),
      tokenBFee: utils.parseEther('0.0052'),
      amountToBeProvidedBySwapper: utils.parseEther('0.3'),
      amountToRewardSwapperWith: utils.parseEther('0.6012'),
      tokenToBeProvidedBySwapper: () => tokenA,
      tokenToRewardSwapperWith: () => tokenB,
    });

    swapTest({
      title: 'rate per unit is 1:2 and there is no need to provide tokens externally',
      nextSwapToPerform: 2,
      initialContractTokenABalance: utils.parseEther('100'),
      initialContractTokenBBalance: utils.parseEther('100'),
      amountToSwapOfTokenA: utils.parseEther('1'),
      amountToSwapOfTokenB: utils.parseEther('2'),
      ratePerUnitBToA: utils.parseEther('0.5'),
      ratePerUnitAToB: utils.parseEther('2'),
      tokenAFee: utils.parseEther('0.002'),
      tokenBFee: utils.parseEther('0.004'),
      amountToBeProvidedBySwapper: utils.parseEther('0'),
      amountToRewardSwapperWith: utils.parseEther('0'),
    });

    swapTest({
      title: 'rate per unit is 3:5 and needing token b to be provided externally',
      nextSwapToPerform: 2,
      initialContractTokenABalance: utils.parseEther('100'),
      initialContractTokenBBalance: utils.parseEther('100'),
      amountToSwapOfTokenA: utils.parseEther('1.4'),
      amountToSwapOfTokenB: utils.parseEther('2'),
      ratePerUnitBToA: utils.parseEther('0.6'),
      ratePerUnitAToB: utils.parseEther('1.666666666666666666'),
      tokenAFee: utils.parseEther('0.0028'),
      tokenBFee: utils.parseEther('0.004'),
      amountToBeProvidedBySwapper: utils.parseEther('0.333333333333333332'),
      amountToRewardSwapperWith: utils.parseEther('0.200399999999999999'),
      tokenToBeProvidedBySwapper: () => tokenB,
      tokenToRewardSwapperWith: () => tokenA,
    });

    swapTest({
      title: 'rate per unit is 3:5 and needing token a to be provided externally',
      nextSwapToPerform: 2,
      initialContractTokenABalance: utils.parseEther('100'),
      initialContractTokenBBalance: utils.parseEther('100'),
      amountToSwapOfTokenA: utils.parseEther('1'),
      amountToSwapOfTokenB: utils.parseEther('5'),
      ratePerUnitBToA: utils.parseEther('0.6'),
      ratePerUnitAToB: utils.parseEther('1.666666666666666666'),
      tokenAFee: utils.parseEther('0.002'),
      tokenBFee: utils.parseEther('0.010'),
      amountToBeProvidedBySwapper: utils.parseEther('2'),
      amountToRewardSwapperWith: utils.parseEther('3.339999999999999998'),
      tokenToBeProvidedBySwapper: () => tokenA,
      tokenToRewardSwapperWith: () => tokenB,
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
  function swapTest({
    title,
    nextSwapToPerform,
    initialContractTokenABalance,
    initialContractTokenBBalance,
    amountToSwapOfTokenA,
    amountToSwapOfTokenB,
    ratePerUnitBToA,
    ratePerUnitAToB,
    tokenAFee,
    tokenBFee,
    amountToBeProvidedBySwapper,
    amountToRewardSwapperWith,
    tokenToBeProvidedBySwapper,
    tokenToRewardSwapperWith,
  }: {
    title: string;
    nextSwapToPerform: BigNumber | number | string;
    initialContractTokenABalance: BigNumber | number | string;
    initialContractTokenBBalance: BigNumber | number | string;
    amountToSwapOfTokenA: BigNumber | number | string;
    amountToSwapOfTokenB: BigNumber | number | string;
    ratePerUnitBToA: BigNumber | number | string;
    ratePerUnitAToB: BigNumber | number | string;
    tokenAFee: BigNumber | number | string;
    tokenBFee: BigNumber | number | string;
    amountToBeProvidedBySwapper: BigNumber | number | string;
    amountToRewardSwapperWith: BigNumber | number | string;
    tokenToBeProvidedBySwapper?: () => Contract;
    tokenToRewardSwapperWith?: () => Contract;
  }) {
    nextSwapToPerform = bn.toBN(nextSwapToPerform);
    initialContractTokenABalance = bn.toBN(initialContractTokenABalance);
    initialContractTokenBBalance = bn.toBN(initialContractTokenBBalance);
    amountToSwapOfTokenA = bn.toBN(amountToSwapOfTokenA);
    amountToSwapOfTokenB = bn.toBN(amountToSwapOfTokenB);
    ratePerUnitBToA = bn.toBN(ratePerUnitBToA);
    ratePerUnitAToB = bn.toBN(ratePerUnitAToB);
    tokenAFee = bn.toBN(tokenAFee);
    tokenBFee = bn.toBN(tokenBFee);
    amountToBeProvidedBySwapper = bn.toBN(amountToBeProvidedBySwapper);
    amountToRewardSwapperWith = bn.toBN(amountToRewardSwapperWith);
    let initialSwapperTokenABalance: BigNumber;
    let initialSwapperTokenBBalance: BigNumber;
    let initialLastSwapPerformed: BigNumber;
    let swapTx: Promise<TransactionResponse>;

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
        initialSwapperTokenABalance = await tokenA.balanceOf(owner.address);
        initialSwapperTokenBBalance = await tokenB.balanceOf(owner.address);
        initialLastSwapPerformed = await DCAPairSwapHandler.lastSwapPerformed();
        if (tokenToBeProvidedBySwapper) {
          await tokenToBeProvidedBySwapper().approve(DCAPairSwapHandler.address, (amountToBeProvidedBySwapper as BigNumber).add(1)); // 1 wei for threshold
        }
        swapTx = DCAPairSwapHandler.swap();
      });
      then('tx is not reverted', async () => {
        await expect(swapTx).to.not.be.reverted;
      });
      then('token to be provided by swapper needed is provided', async () => {
        if (!tokenToBeProvidedBySwapper) {
          bn.expectToEqualWithThreshold({
            value: await tokenA.balanceOf(DCAPairSwapHandler.address),
            to: (initialContractTokenABalance as BigNumber).sub(tokenAFee),
            threshold: BigNumber.from('1'),
          });
          bn.expectToEqualWithThreshold({
            value: await tokenB.balanceOf(DCAPairSwapHandler.address),
            to: (initialContractTokenBBalance as BigNumber).sub(tokenBFee),
            threshold: BigNumber.from('1'),
          });
        } else if (tokenToBeProvidedBySwapper() === tokenA) {
          bn.expectToEqualWithThreshold({
            value: (await tokenA.balanceOf(DCAPairSwapHandler.address)).add(tokenAFee),
            to: (initialContractTokenABalance as BigNumber).add(amountToBeProvidedBySwapper),
            threshold: BigNumber.from('1'),
          });
        } else if (tokenToBeProvidedBySwapper() === tokenB) {
          bn.expectToEqualWithThreshold({
            value: (await tokenB.balanceOf(DCAPairSwapHandler.address)).add(tokenBFee),
            to: (initialContractTokenBBalance as BigNumber).add(amountToBeProvidedBySwapper),
            threshold: BigNumber.from('1'),
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
        } else if (tokenToBeProvidedBySwapper() === tokenA) {
          bn.expectToEqualWithThreshold({
            value: await tokenA.balanceOf(owner.address),
            to: initialSwapperTokenABalance.sub(amountToBeProvidedBySwapper),
            threshold: BigNumber.from('1'),
          });
        } else if (tokenToBeProvidedBySwapper() === tokenB) {
          bn.expectToEqualWithThreshold({
            value: await tokenB.balanceOf(owner.address),
            to: initialSwapperTokenBBalance.sub(amountToBeProvidedBySwapper),
            threshold: BigNumber.from('1'),
          });
        }
      });
      then('token to reward the swapper with is taken from the pair', async () => {
        if (!tokenToRewardSwapperWith) {
          bn.expectToEqualWithThreshold({
            value: await tokenA.balanceOf(DCAPairSwapHandler.address),
            to: (initialContractTokenABalance as BigNumber).sub(tokenAFee),
            threshold: BigNumber.from('1'),
          });
          bn.expectToEqualWithThreshold({
            value: await tokenB.balanceOf(DCAPairSwapHandler.address),
            to: (initialContractTokenBBalance as BigNumber).sub(tokenBFee),
            threshold: BigNumber.from('1'),
          });
        } else if (tokenToRewardSwapperWith() === tokenA) {
          bn.expectToEqualWithThreshold({
            value: (await tokenA.balanceOf(DCAPairSwapHandler.address)).add(tokenAFee),
            to: (initialContractTokenABalance as BigNumber).sub(amountToRewardSwapperWith),
            threshold: BigNumber.from('1'),
          });
        } else if (tokenToRewardSwapperWith() === tokenB) {
          bn.expectToEqualWithThreshold({
            value: (await tokenB.balanceOf(DCAPairSwapHandler.address)).add(tokenBFee),
            to: (initialContractTokenBBalance as BigNumber).sub(amountToRewardSwapperWith),
            threshold: BigNumber.from('1'),
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
        } else if (tokenToRewardSwapperWith() === tokenA) {
          bn.expectToEqualWithThreshold({
            value: await tokenA.balanceOf(owner.address),
            to: initialSwapperTokenABalance.add(amountToRewardSwapperWith),
            threshold: BigNumber.from('1'),
          });
        } else if (tokenToRewardSwapperWith() === tokenB) {
          bn.expectToEqualWithThreshold({
            value: await tokenB.balanceOf(owner.address),
            to: initialSwapperTokenBBalance.add(amountToRewardSwapperWith),
            threshold: BigNumber.from('1'),
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
        expect(await tokenA.balanceOf(feeRecipient.address)).to.equal(tokenAFee);
      });
      then('sends token b fee correctly to fee recipient', async () => {
        expect(await tokenB.balanceOf(feeRecipient.address)).to.equal(tokenBFee);
      });
      then('updates performed swaps', async () => {
        expect(await DCAPairSwapHandler.performedSwaps()).to.equal(nextSwapToPerform);
      });
      then('updates last swap performend timestamp', async () => {
        expect(await DCAPairSwapHandler.lastSwapPerformed()).to.be.gt(initialLastSwapPerformed);
      });
      then('emits event with correct information', async () => {
        const transactionResponse = await swapTx;
        const nextSwapInformation = (await readArgFromEvent(transactionResponse, 'Swapped', '_nextSwapInformation')) as NextSwapInfo;
        expect(nextSwapInformation.swapToPerform).to.equal(nextSwapToPerform);
        bn.expectToEqualWithThreshold({
          value: nextSwapInformation.amountToSwapTokenA,
          to: amountToSwapOfTokenA,
          threshold: BigNumber.from('1'),
        });
        bn.expectToEqualWithThreshold({
          value: nextSwapInformation.amountToSwapTokenB,
          to: amountToSwapOfTokenB,
          threshold: BigNumber.from('1'),
        });
        bn.expectToEqualWithThreshold({
          value: nextSwapInformation.ratePerUnitBToA,
          to: ratePerUnitBToA,
          threshold: BigNumber.from('1'),
        });
        bn.expectToEqualWithThreshold({
          value: nextSwapInformation.ratePerUnitAToB,
          to: ratePerUnitAToB,
          threshold: BigNumber.from('1'),
        });
        bn.expectToEqualWithThreshold({
          value: nextSwapInformation.tokenAFee,
          to: tokenAFee,
          threshold: BigNumber.from('1'),
        });
        bn.expectToEqualWithThreshold({
          value: nextSwapInformation.tokenBFee,
          to: tokenBFee,
          threshold: BigNumber.from('1'),
        });
        bn.expectToEqualWithThreshold({
          value: nextSwapInformation.amountToBeProvidedBySwapper,
          to: amountToBeProvidedBySwapper,
          threshold: BigNumber.from('1'),
        });
        bn.expectToEqualWithThreshold({
          value: nextSwapInformation.amountToRewardSwapperWith,
          to: amountToRewardSwapperWith,
          threshold: BigNumber.from('1'),
        });
        if (!tokenToBeProvidedBySwapper) {
          expect(nextSwapInformation.tokenToBeProvidedBySwapper).to.equal(constants.ZERO_ADDRESS);
          expect(nextSwapInformation.tokenToRewardSwapperWith).to.equal(constants.ZERO_ADDRESS);
        } else {
          expect(nextSwapInformation.tokenToBeProvidedBySwapper).to.equal(tokenToBeProvidedBySwapper().address);
          expect(nextSwapInformation.tokenToRewardSwapperWith).to.equal(tokenToRewardSwapperWith!().address);
        }
      });
    });
  }
});
