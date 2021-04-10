import moment from 'moment';
import { expect } from 'chai';
import { BigNumber, Contract, ContractFactory, Signer, utils } from 'ethers';
import { ethers } from 'hardhat';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { constants, uniswap, erc20, behaviours, evm, bn } from '../../utils';
import { given, then, when } from '../../utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { readArgFromEvent } from '../../utils/event-utils';

const MINIMUM_SWAP_INTERVAL = BigNumber.from('60');

describe('DCAPairSwapHandler', function () {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let feeRecipient: SignerWithAddress;
  let tokenA: Contract, tokenB: Contract;
  let pair: Contract;
  let DCAPairSwapHandlerContract: ContractFactory;
  let DCAPairSwapHandler: Contract;
  let slidingOracleContract: ContractFactory;
  let slidingOracle: Contract;
  const swapInterval = moment.duration(1, 'days').as('seconds');

  before('Setup accounts and contracts', async () => {
    [owner, alice, feeRecipient] = await ethers.getSigners();
    DCAPairSwapHandlerContract = await ethers.getContractFactory(
      'contracts/mocks/DCAPair/DCAPairSwapHandler.sol:DCAPairSwapHandlerMock'
    );
    slidingOracleContract = await ethers.getContractFactory(
      'contracts/SlidingOracle.sol:SimplifiedSlidingOracle'
    );
  });

  beforeEach('Deploy and configure', async () => {
    await evm.reset();
    await uniswap.deploy({
      owner,
    });
    tokenA = await erc20.deploy({
      name: 'tokenA',
      symbol: 'TKN0',
      initialAccount: await owner.getAddress(),
      initialAmount: ethers.constants.MaxUint256,
    });
    tokenB = await erc20.deploy({
      name: 'tokenB',
      symbol: 'TKN1',
      initialAccount: await owner.getAddress(),
      initialAmount: ethers.constants.MaxUint256,
    });
    pair = await uniswap.createPair({
      token0: tokenB,
      token1: tokenA,
    });
    slidingOracle = await slidingOracleContract.deploy(
      uniswap.getUniswapV2Factory().address,
      pair.address,
      swapInterval
    );
    DCAPairSwapHandler = await DCAPairSwapHandlerContract.deploy(
      tokenA.address,
      tokenB.address,
      uniswap.getUniswapV2Router02().address,
      constants.NOT_ZERO_ADDRESS, // factory
      slidingOracle.address, // oracle
      swapInterval
    );
  });

  describe('constructor', () => {
    when('swap interval is less than MINIMUM_SWAP_INTERVAL', () => {
      then('reverts with message', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: DCAPairSwapHandlerContract,
          args: [
            tokenA.address,
            tokenB.address,
            uniswap.getUniswapV2Router02().address,
            constants.NOT_ZERO_ADDRESS, // factory
            slidingOracle.address,
            MINIMUM_SWAP_INTERVAL.sub(1),
          ],
          message: 'DCAPair: interval too short',
        });
      });
    });
    when('factory is zero', () => {
      then('reverts with message', async () => {
        await behaviours.deployShouldRevertWithZeroAddress({
          contract: DCAPairSwapHandlerContract,
          args: [
            tokenA.address,
            tokenB.address,
            uniswap.getUniswapV2Router02().address,
            constants.ZERO_ADDRESS,
            slidingOracle.address,
            MINIMUM_SWAP_INTERVAL,
          ],
        });
      });
    });
    when('oracle is zero', () => {
      then('reverts with message', async () => {
        await behaviours.deployShouldRevertWithZeroAddress({
          contract: DCAPairSwapHandlerContract,
          args: [
            tokenA.address,
            tokenB.address,
            uniswap.getUniswapV2Router02().address,
            constants.NOT_ZERO_ADDRESS,
            constants.ZERO_ADDRESS,
            MINIMUM_SWAP_INTERVAL,
          ],
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
            uniswap.getUniswapV2Router02().address,
            constants.NOT_ZERO_ADDRESS, // factory
            slidingOracle.address,
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
    when('oracle is zero address', () => {
      given(function () {
        this.setOracleTx = DCAPairSwapHandler.setOracle(constants.ZERO_ADDRESS);
      });
      then('tx is reverted with reason', async function () {
        await expect(this.setOracleTx).to.be.revertedWith(
          'DCAPair: zero-address'
        );
      });
    });
    when('oracle is a valid address', () => {
      given(async function () {
        this.newOracle = constants.NOT_ZERO_ADDRESS;
        this.setOracleTx = DCAPairSwapHandler.setOracle(this.newOracle);
        await this.setOracleTx;
      });
      then('oracle is set', async function () {
        expect(await DCAPairSwapHandler.oracle()).to.be.equal(this.newOracle);
      });
      then('event is emitted', async function () {
        expect(this.setOracleTx)
          .to.emit(DCAPairSwapHandler, 'OracleSet')
          .withArgs(this.newOracle);
      });
    });
  });

  describe('_setSwapInterval', () => {
    when('swap interval is less than MINIMUM_SWAP_INTERVAL', () => {
      then('reverts with message', async () => {
        await expect(
          DCAPairSwapHandler.setSwapInterval(MINIMUM_SWAP_INTERVAL.sub(1))
        ).to.be.revertedWith('DCAPair: interval too short');
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
    const previousAccumRatesPerUnitMultiplierBN = bn.toBN(
      previousAccumRatesPerUnitMultiplier
    );
    const performedSwapBN = bn.toBN(performedSwap);
    const ratePerUnitBN = bn.toBN(ratePerUnit);

    when(title, () => {
      given(async () => {
        await DCAPairSwapHandler.setAcummRatesPerUnit(
          token(),
          performedSwapBN.sub(1),
          [previousAccumRatesPerUnitBN, previousAccumRatesPerUnitMultiplierBN]
        );
        await DCAPairSwapHandler.addNewRatePerUnit(
          token(),
          performedSwapBN,
          ratePerUnit
        );
      });
      then(
        'increments the rates per unit accumulator base and overflow if needed',
        async () => {
          if (
            previousAccumRatesPerUnitBN
              .add(ratePerUnitBN)
              .gt(ethers.constants.MaxUint256)
          ) {
            expect(
              await DCAPairSwapHandler.accumRatesPerUnit(
                token(),
                performedSwapBN,
                0
              )
            ).to.equal(
              ratePerUnitBN.sub(
                ethers.constants.MaxUint256.sub(previousAccumRatesPerUnitBN)
              )
            );
            expect(
              await DCAPairSwapHandler.accumRatesPerUnit(
                token(),
                performedSwapBN,
                1
              )
            ).to.equal(previousAccumRatesPerUnitMultiplierBN.add(1));
          } else {
            expect(
              await DCAPairSwapHandler.accumRatesPerUnit(
                token(),
                performedSwapBN,
                0
              )
            ).to.equal(previousAccumRatesPerUnitBN.add(ratePerUnitBN));
            expect(
              await DCAPairSwapHandler.accumRatesPerUnit(
                token(),
                performedSwapBN,
                1
              )
            ).to.equal(previousAccumRatesPerUnitMultiplierBN);
          }
        }
      );
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
      title:
        'the addition does not overflow the accumulated rates per unit of token A',
      token: () => tokenA.address,
      previousAccumRatesPerUnit: 123456789,
      previousAccumRatesPerUnitMultiplier: 0,
      performedSwap: 2,
      ratePerUnit: 9991230,
    });

    addNewRatePerUnitTest({
      title:
        'previous rate per unit accumulator was too big and overflows token A',
      token: () => tokenA.address,
      previousAccumRatesPerUnit: ethers.constants.MaxUint256.sub('10000'),
      previousAccumRatesPerUnitMultiplier: 0,
      performedSwap: 3,
      ratePerUnit: 9991230,
    });

    addNewRatePerUnitTest({
      title:
        'new rate per unit is too big and overflows accumulator of token A',
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
      title:
        'the addition does not overflow the accumulated rates per unit of token B',
      token: () => tokenB.address,
      previousAccumRatesPerUnit: 123456789,
      previousAccumRatesPerUnitMultiplier: 0,
      performedSwap: 2,
      ratePerUnit: 9991230,
    });
    addNewRatePerUnitTest({
      title:
        'previous rate per unit accumulator was too big and overflows token B',
      token: () => tokenB.address,
      previousAccumRatesPerUnit: ethers.constants.MaxUint256.sub('10000'),
      previousAccumRatesPerUnitMultiplier: 0,
      performedSwap: 3,
      ratePerUnit: 9991230,
    });

    addNewRatePerUnitTest({
      title:
        'new rate per unit is too big and overflows accumulator of token B',
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
      given(async function () {
        await DCAPairSwapHandler.registerSwap(
          token(),
          internalAmountUsedToSwapBN,
          ratePerUnitBN,
          performedSwapBN
        );
      });
      then(
        'sets swap amount accumulator to last internal swap',
        async function () {
          expect(
            await DCAPairSwapHandler.swapAmountAccumulator(token())
          ).to.equal(internalAmountUsedToSwapBN);
        }
      );
      then('adds new rate per unit', async function () {
        // expect('_addNewRatePerUnit').to.be.calledOnContractWith(DCAPairSwapHandler, [token(), performedSwapBN, ratePerUnitBN]);
      });
      then('deletes swap amount delta of swap to register', async function () {
        expect(
          await DCAPairSwapHandler.swapAmountDelta(token(), performedSwapBN)
        ).to.equal(0);
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
    context(
      'when the amount to swap is augmented (swap amount delta is positive)',
      () => {
        let swapAmountAccumulator = ethers.constants.MaxUint256.div(2);
        let swapAmountDeltas: BigNumber[] = [];
        const getRandomInt = (min: number, max: number): number =>
          Math.floor(Math.random() * (max - min)) + min;

        beforeEach(async () => {
          await DCAPairSwapHandler.setSwapAmountAccumulator(
            tokenA.address,
            swapAmountAccumulator
          );
          for (let i = 1; i <= 10; i++) {
            swapAmountDeltas.push(
              BigNumber.from(`${getRandomInt(1, 9999999999)}`)
            );
            await DCAPairSwapHandler.setSwapAmountDelta(
              tokenA.address,
              BigNumber.from(i),
              swapAmountDeltas[i - 1]
            );
          }
        });
        it('returns augments amount to swap', async () => {
          for (let i = 1; i <= 10; i++) {
            expect(
              await DCAPairSwapHandler.swapAmountAccumulator(tokenA.address)
            ).to.equal(swapAmountAccumulator);
            const amountToSwap = swapAmountAccumulator.add(
              swapAmountDeltas[i - 1]
            );
            expect(amountToSwap).to.be.gt(swapAmountAccumulator);
            expect(
              await DCAPairSwapHandler.getAmountToSwap(tokenA.address, i)
            ).to.equal(amountToSwap);
            await DCAPairSwapHandler.setSwapAmountAccumulator(
              tokenA.address,
              amountToSwap
            );
            swapAmountAccumulator = amountToSwap;
          }
        });
      }
    );
    context(
      'when the amount to swap is reduced (swap amount delta negative)',
      () => {
        context('and swap delta is type(int256).min', () => {
          const swapAmountAccumulator = constants.MAX_INT_256.add(1);
          const swapAmountDelta = constants.MIN_INT_256;
          const swap = BigNumber.from('1');
          beforeEach(async () => {
            await DCAPairSwapHandler.setSwapAmountAccumulator(
              tokenA.address,
              swapAmountAccumulator
            );
            await DCAPairSwapHandler.setSwapAmountDelta(
              tokenA.address,
              swap,
              swapAmountDelta
            );
          });
          it('calculates correctly the final amount to buy', async () => {
            expect(
              await DCAPairSwapHandler.swapAmountAccumulator(tokenA.address)
            ).to.equal(swapAmountAccumulator);
            const amountToSwap = await DCAPairSwapHandler.getAmountToSwap(
              tokenA.address,
              swap
            );
            expect(amountToSwap).to.be.lt(swapAmountAccumulator);
            expect(amountToSwap).to.equal(
              swapAmountAccumulator.add(swapAmountDelta)
            );
          });
        });
        context('and swap delta is not a extreme parameter', () => {
          let swapAmountAccumulator = ethers.constants.MaxUint256.div(2);
          let swapAmountDeltas: BigNumber[] = [];
          beforeEach(async () => {
            await DCAPairSwapHandler.setSwapAmountAccumulator(
              tokenA.address,
              swapAmountAccumulator
            );
            for (let i = 1; i <= 10; i++) {
              swapAmountDeltas.push(
                BigNumber.from(
                  `${Math.floor(Math.random() * 1000000) - 999999}`
                )
              );
              await DCAPairSwapHandler.setSwapAmountDelta(
                tokenA.address,
                BigNumber.from(i),
                swapAmountDeltas[i - 1]
              );
            }
          });
          it('returns reduced amount to swap', async () => {
            for (let i = 1; i <= 10; i++) {
              expect(
                await DCAPairSwapHandler.swapAmountAccumulator(tokenA.address)
              ).to.equal(swapAmountAccumulator);
              const amountToSwap = swapAmountAccumulator.add(
                swapAmountDeltas[i - 1]
              );
              expect(amountToSwap).to.be.lt(swapAmountAccumulator);
              expect(
                await DCAPairSwapHandler.getAmountToSwap(tokenA.address, i)
              ).to.equal(amountToSwap);
              await DCAPairSwapHandler.setSwapAmountAccumulator(
                tokenA.address,
                amountToSwap
              );
              swapAmountAccumulator = amountToSwap;
            }
          });
        });
      }
    );
  });

  const setOracleData = async ({
    ratePerUnitAToB,
    observations,
  }: {
    ratePerUnitAToB: BigNumber;
    observations: number;
  }) => {
    // 1eDecimals A - ratePerUnitAToB
    const tokenADecimals = BigNumber.from(await tokenA.decimals());
    await uniswap.addLiquidity({
      owner,
      token0: tokenA,
      amountA: BigNumber.from('10').pow(tokenADecimals).mul('100000'),
      token1: tokenB,
      amountB: ratePerUnitAToB.mul('100000'),
    });
    for (let i = 0; i < observations; i++) {
      await slidingOracle.update();
      await evm.advanceTimeAndBlock(swapInterval);
    }
    // await tokenA.transfer(pair.address, utils.parseEther('100'));
    // await pair.sync();
  };

  const setNextSwapInfo = async ({
    nextSwapToPerform,
    amountToSwapOfTokenA,
    amountToSwapOfTokenB,
    ratePerUnitAToB,
  }: {
    nextSwapToPerform: BigNumber | number | string;
    amountToSwapOfTokenA: BigNumber | number | string;
    amountToSwapOfTokenB: BigNumber | number | string;
    ratePerUnitAToB: BigNumber | number | string;
  }) => {
    nextSwapToPerform = bn.toBN(nextSwapToPerform);
    amountToSwapOfTokenA = bn.toBN(amountToSwapOfTokenA);
    amountToSwapOfTokenB = bn.toBN(amountToSwapOfTokenB);
    ratePerUnitAToB = bn.toBN(ratePerUnitAToB);
    await DCAPairSwapHandler.setPerformedSwaps(nextSwapToPerform.sub(1));
    await DCAPairSwapHandler.setSwapAmountAccumulator(
      tokenA.address,
      amountToSwapOfTokenA.div(2)
    );
    await DCAPairSwapHandler.setSwapAmountDelta(
      tokenA.address,
      nextSwapToPerform,
      amountToSwapOfTokenA.div(2)
    );
    await DCAPairSwapHandler.setSwapAmountAccumulator(
      tokenB.address,
      amountToSwapOfTokenB.div(2)
    );
    await DCAPairSwapHandler.setSwapAmountDelta(
      tokenB.address,
      nextSwapToPerform,
      amountToSwapOfTokenB.div(2)
    );
    await setOracleData({
      ratePerUnitAToB,
      observations: 10,
    });
  };

  function getNextSwapInfoTest({
    title,
    nextSwapToPerform,
    amountToSwapOfTokenA,
    amountToSwapOfTokenB,
    ratePerUnitAToB,
    amountToBeProvidedExternally,
    tokenToBeProvidedExternally,
  }: {
    title: string;
    nextSwapToPerform: BigNumber | number | string;
    amountToSwapOfTokenA: BigNumber | number | string;
    amountToSwapOfTokenB: BigNumber | number | string;
    ratePerUnitAToB: BigNumber | number | string;
    amountToBeProvidedExternally: BigNumber | number | string;
    tokenToBeProvidedExternally: () => string;
  }) {
    nextSwapToPerform = bn.toBN(nextSwapToPerform);
    amountToSwapOfTokenA = bn.toBN(amountToSwapOfTokenA);
    amountToSwapOfTokenB = bn.toBN(amountToSwapOfTokenB);
    ratePerUnitAToB = bn.toBN(ratePerUnitAToB);
    amountToBeProvidedExternally = bn.toBN(amountToBeProvidedExternally);

    when(title, () => {
      given(async function () {
        await setNextSwapInfo({
          nextSwapToPerform: nextSwapToPerform,
          amountToSwapOfTokenA: amountToSwapOfTokenA,
          amountToSwapOfTokenB: amountToSwapOfTokenB,
          ratePerUnitAToB: ratePerUnitAToB,
        });
        this.nextSwapInfo = await DCAPairSwapHandler.getNextSwapInfo();
      });
      then('swap to perform is current + 1', function () {
        expect(this.nextSwapInfo._swapToPerform).to.equal(nextSwapToPerform);
      });
      then('amount to swap of token A is correct', function () {
        expect(this.nextSwapInfo._amountToSwapTokenA).to.equal(
          amountToSwapOfTokenA
        );
      });
      then('amount to swap of token B is correct', function () {
        expect(this.nextSwapInfo._amountToSwapTokenB).to.equal(
          amountToSwapOfTokenB
        );
      });
      then('rate of unit a to b is correct', function () {
        expect(
          bn.equal({
            value: this.nextSwapInfo._ratePerUnitAToB,
            to: ratePerUnitAToB,
            threshold: BigNumber.from('1'),
          })
        ).to.be.true;
      });
      then('rate of unit b to a is correct', async function () {
        // 1e18 A = 1e17.5 B
        // X A      = 1eDecimals B
        // => rate = 1eDecimals B * 1eDecimals A / 1e17.5 B
        const tokenBDecimals = BigNumber.from('10').pow(
          BigNumber.from(await tokenB.decimals())
        );
        const tokenADecimals = BigNumber.from('10').pow(
          BigNumber.from(await tokenA.decimals())
        );
        const ratePerUnitBToA = tokenBDecimals
          .mul(tokenADecimals)
          .div(this.nextSwapInfo._ratePerUnitAToB);
        expect(this.nextSwapInfo._ratePerUnitBToA).to.equal(ratePerUnitBToA);
      });
      then(
        'the amount of tokens to be provided externally is correct',
        async function () {
          expect(this.nextSwapInfo._amountToBeProvidedExternally).to.be.equal(
            amountToBeProvidedExternally
          );
        }
      );
      then('token to be provided externally is correct', async function () {
        expect(this.nextSwapInfo._tokenToBeProvidedExternally).to.be.equal(
          tokenToBeProvidedExternally()
        );
      });
    });
  }

  describe('getNextSwapInfo', () => {
    getNextSwapInfoTest({
      title:
        'rate per unit is 1:1 and needing token b to be provided externally',
      nextSwapToPerform: 2,
      amountToSwapOfTokenA: utils.parseEther('1.4'),
      amountToSwapOfTokenB: utils.parseEther('1.3'),
      ratePerUnitAToB: utils.parseEther('1'),
      amountToBeProvidedExternally: utils.parseEther('0.1'),
      tokenToBeProvidedExternally: () => tokenB.address,
    });

    getNextSwapInfoTest({
      title:
        'rate per unit is 1:1 and needing token a to be provided externally',
      nextSwapToPerform: 2,
      amountToSwapOfTokenA: utils.parseEther('1'),
      amountToSwapOfTokenB: utils.parseEther('1.3'),
      ratePerUnitAToB: utils.parseEther('1'),
      amountToBeProvidedExternally: utils.parseEther('0.3'),
      tokenToBeProvidedExternally: () => tokenA.address,
    });

    getNextSwapInfoTest({
      title:
        'rate per unit is 1:1 and there is no need to provide tokens externally',
      nextSwapToPerform: 2,
      amountToSwapOfTokenA: utils.parseEther('1'),
      amountToSwapOfTokenB: utils.parseEther('1'),
      ratePerUnitAToB: utils.parseEther('1'),
      amountToBeProvidedExternally: utils.parseEther('0'),
      tokenToBeProvidedExternally: () => constants.ZERO_ADDRESS,
    });

    getNextSwapInfoTest({
      title:
        'rate per unit is 1:2 and needing token b to be provided externally',
      nextSwapToPerform: 2,
      amountToSwapOfTokenA: utils.parseEther('1.4'),
      amountToSwapOfTokenB: utils.parseEther('2.6'),
      ratePerUnitAToB: utils.parseEther('2'),
      amountToBeProvidedExternally: utils.parseEther('0.2'),
      tokenToBeProvidedExternally: () => tokenB.address,
    });

    getNextSwapInfoTest({
      title:
        'rate per unit is 1:2 and needing token a to be provided externally',
      nextSwapToPerform: 2,
      amountToSwapOfTokenA: utils.parseEther('1'),
      amountToSwapOfTokenB: utils.parseEther('2.6'),
      ratePerUnitAToB: utils.parseEther('2'),
      amountToBeProvidedExternally: utils.parseEther('0.3'),
      tokenToBeProvidedExternally: () => tokenA.address,
    });

    getNextSwapInfoTest({
      title:
        'rate per unit is 1:2 and there is no need to provide tokens externally',
      nextSwapToPerform: 2,
      amountToSwapOfTokenA: utils.parseEther('1'),
      amountToSwapOfTokenB: utils.parseEther('2'),
      ratePerUnitAToB: utils.parseEther('2'),
      amountToBeProvidedExternally: utils.parseEther('0'),
      tokenToBeProvidedExternally: () => constants.ZERO_ADDRESS,
    });

    getNextSwapInfoTest({
      title:
        'rate per unit is 3:5 and needing token b to be provided externally',
      nextSwapToPerform: 2,
      amountToSwapOfTokenA: utils.parseEther('1.4'),
      amountToSwapOfTokenB: utils.parseEther('2'),
      ratePerUnitAToB: utils.parseEther('1.6666666666'),
      amountToBeProvidedExternally: utils.parseEther('0.33333333324'),
      tokenToBeProvidedExternally: () => tokenB.address,
    });

    getNextSwapInfoTest({
      title:
        'rate per unit is 3:5 and needing token a to be provided externally',
      nextSwapToPerform: 2,
      amountToSwapOfTokenA: utils.parseEther('1'),
      amountToSwapOfTokenB: utils.parseEther('5'),
      ratePerUnitAToB: utils.parseEther('1.6666666666'),
      amountToBeProvidedExternally: utils.parseEther('2.00000000012'),
      tokenToBeProvidedExternally: () => tokenA.address,
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

  describe('_swap', () => {
    when('last swap was < than swap interval ago', () => {
      given(async () => {
        await DCAPairSwapHandler.setLastSwapPerformed(moment().unix());
      });
      then('reverts with message', async () => {
        await expect(DCAPairSwapHandler.swap()).to.be.revertedWith(
          'DCAPair: within swap interval'
        );
      });
    });
    when('external amount of token a to be provided is not approved', () => {
      given(async () => {
        await setNextSwapInfo({
          nextSwapToPerform: 2,
          amountToSwapOfTokenA: utils.parseEther('1'),
          amountToSwapOfTokenB: utils.parseEther('2'),
          ratePerUnitAToB: utils.parseEther('1'),
        });
      });
      then('tx is reverted with reason', async () => {
        await expect(DCAPairSwapHandler.swap()).to.be.revertedWith(
          'ERC20: transfer amount exceeds allowance'
        );
      });
    });
    when(
      'external amount of token a to be provided is approved but swapper does not own',
      () => {
        given(async () => {
          await setNextSwapInfo({
            nextSwapToPerform: 2,
            amountToSwapOfTokenA: utils.parseEther('1'),
            amountToSwapOfTokenB: utils.parseEther('2'),
            ratePerUnitAToB: utils.parseEther('1'),
          });
          await tokenA.transfer(
            constants.NOT_ZERO_ADDRESS,
            await tokenA.balanceOf(owner.address)
          );
          await tokenA.approve(
            DCAPairSwapHandler.address,
            ethers.constants.MaxUint256
          );
        });
        then('tx is reverted with reason', async () => {
          await expect(DCAPairSwapHandler.swap()).to.be.revertedWith(
            'ERC20: transfer amount exceeds balance'
          );
        });
      }
    );

    when('external amount of token b to be provided is not approved', () => {
      given(async () => {
        await setNextSwapInfo({
          nextSwapToPerform: 2,
          amountToSwapOfTokenA: utils.parseEther('2'),
          amountToSwapOfTokenB: utils.parseEther('1'),
          ratePerUnitAToB: utils.parseEther('1'),
        });
      });
      then('tx is reverted with reason', async () => {
        await expect(DCAPairSwapHandler.swap()).to.be.revertedWith(
          'ERC20: transfer amount exceeds allowance'
        );
      });
    });
    when(
      'external amount of token b to be provided is approved but swapper does not own',
      () => {
        given(async () => {
          await setNextSwapInfo({
            nextSwapToPerform: 2,
            amountToSwapOfTokenA: utils.parseEther('2'),
            amountToSwapOfTokenB: utils.parseEther('1'),
            ratePerUnitAToB: utils.parseEther('1'),
          });
          await tokenB.transfer(
            constants.NOT_ZERO_ADDRESS,
            await tokenB.balanceOf(owner.address)
          );
          await tokenB.approve(
            DCAPairSwapHandler.address,
            ethers.constants.MaxUint256
          );
        });
        then('tx is reverted with reason', async () => {
          await expect(DCAPairSwapHandler.swap()).to.be.revertedWith(
            'ERC20: transfer amount exceeds balance'
          );
        });
      }
    );

    swapTest({
      title:
        'rate per unit is 1:1 and needing token b to be provided externally',
      nextSwapToPerform: 2,
      amountToSwapOfTokenA: utils.parseEther('1.4'),
      amountToSwapOfTokenB: utils.parseEther('1.3'),
      ratePerUnitBToA: utils.parseEther('1'),
      ratePerUnitAToB: utils.parseEther('1'),
      amountToBeProvidedExternally: utils.parseEther('0.1'),
      tokenToBeProvidedExternally: () => tokenB.address,
    });

    swapTest({
      title:
        'rate per unit is 1:1 and needing token a to be provided externally',
      nextSwapToPerform: 2,
      amountToSwapOfTokenA: utils.parseEther('1'),
      amountToSwapOfTokenB: utils.parseEther('1.3'),
      ratePerUnitBToA: utils.parseEther('1'),
      ratePerUnitAToB: utils.parseEther('1'),
      amountToBeProvidedExternally: utils.parseEther('0.3'),
      tokenToBeProvidedExternally: () => tokenA.address,
    });

    swapTest({
      title:
        'rate per unit is 1:1 and there is no need to provide tokens externally',
      nextSwapToPerform: 2,
      amountToSwapOfTokenA: utils.parseEther('1'),
      amountToSwapOfTokenB: utils.parseEther('1'),
      ratePerUnitBToA: utils.parseEther('1'),
      ratePerUnitAToB: utils.parseEther('1'),
      amountToBeProvidedExternally: utils.parseEther('0'),
      tokenToBeProvidedExternally: () => constants.ZERO_ADDRESS,
    });

    swapTest({
      title:
        'rate per unit is 1:2 and needing token b to be provided externally',
      nextSwapToPerform: 2,
      amountToSwapOfTokenA: utils.parseEther('1.4'),
      amountToSwapOfTokenB: utils.parseEther('2.6'),
      ratePerUnitBToA: utils.parseEther('0.5'),
      ratePerUnitAToB: utils.parseEther('2'),
      amountToBeProvidedExternally: utils.parseEther('0.2'),
      tokenToBeProvidedExternally: () => tokenB.address,
    });

    swapTest({
      title:
        'rate per unit is 1:2 and needing token a to be provided externally',
      nextSwapToPerform: 2,
      amountToSwapOfTokenA: utils.parseEther('1'),
      amountToSwapOfTokenB: utils.parseEther('2.6'),
      ratePerUnitBToA: utils.parseEther('0.5'),
      ratePerUnitAToB: utils.parseEther('2'),
      amountToBeProvidedExternally: utils.parseEther('0.3'),
      tokenToBeProvidedExternally: () => tokenA.address,
    });

    swapTest({
      title:
        'rate per unit is 1:2 and there is no need to provide tokens externally',
      nextSwapToPerform: 2,
      amountToSwapOfTokenA: utils.parseEther('1'),
      amountToSwapOfTokenB: utils.parseEther('2'),
      ratePerUnitBToA: utils.parseEther('0.5'),
      ratePerUnitAToB: utils.parseEther('2'),
      amountToBeProvidedExternally: utils.parseEther('0'),
      tokenToBeProvidedExternally: () => constants.ZERO_ADDRESS,
    });

    swapTest({
      title:
        'rate per unit is 3:5 and needing token b to be provided externally',
      nextSwapToPerform: 2,
      amountToSwapOfTokenA: utils.parseEther('1.4'),
      amountToSwapOfTokenB: utils.parseEther('2'),
      ratePerUnitBToA: utils.parseEther('0.600000000024'),
      ratePerUnitAToB: utils.parseEther('1.6666666666'),
      amountToBeProvidedExternally: utils.parseEther('0.33333333324'),
      tokenToBeProvidedExternally: () => tokenB.address,
    });

    swapTest({
      title:
        'rate per unit is 3:5 and needing token a to be provided externally',
      nextSwapToPerform: 2,
      amountToSwapOfTokenA: utils.parseEther('1'),
      amountToSwapOfTokenB: utils.parseEther('5'),
      ratePerUnitBToA: utils.parseEther('0.600000000024'),
      ratePerUnitAToB: utils.parseEther('1.6666666666'),
      amountToBeProvidedExternally: utils.parseEther('2.00000000012'),
      tokenToBeProvidedExternally: () => tokenA.address,
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
    amountToSwapOfTokenA,
    amountToSwapOfTokenB,
    ratePerUnitBToA,
    ratePerUnitAToB,
    amountToBeProvidedExternally,
    tokenToBeProvidedExternally,
  }: {
    title: string;
    nextSwapToPerform: BigNumber | number | string;
    amountToSwapOfTokenA: BigNumber | number | string;
    amountToSwapOfTokenB: BigNumber | number | string;
    ratePerUnitAToB: BigNumber | number | string;
    ratePerUnitBToA: BigNumber | number | string;
    amountToBeProvidedExternally: BigNumber | number | string;
    tokenToBeProvidedExternally: () => string;
  }) {
    nextSwapToPerform = bn.toBN(nextSwapToPerform);
    amountToSwapOfTokenA = bn.toBN(amountToSwapOfTokenA);
    amountToSwapOfTokenB = bn.toBN(amountToSwapOfTokenB);
    ratePerUnitAToB = bn.toBN(ratePerUnitAToB);
    amountToBeProvidedExternally = bn.toBN(amountToBeProvidedExternally);
    when(title, () => {
      given(async function () {
        await setNextSwapInfo({
          nextSwapToPerform: nextSwapToPerform,
          amountToSwapOfTokenA: amountToSwapOfTokenA,
          amountToSwapOfTokenB: amountToSwapOfTokenB,
          ratePerUnitAToB: ratePerUnitAToB,
        });
        this.initialContractTokenABalance = await tokenA.balanceOf(
          DCAPairSwapHandler.address
        );
        this.initialContractTokenBBalance = await tokenB.balanceOf(
          DCAPairSwapHandler.address
        );
        this.initialSwapperTokenABalance = await tokenA.balanceOf(
          owner.address
        );
        this.initialSwapperTokenBBalance = await tokenB.balanceOf(
          owner.address
        );
        this.initialLastSwapPerformed = await DCAPairSwapHandler.lastSwapPerformed();
        if (
          tokenToBeProvidedExternally().toLowerCase() ===
          tokenA.address.toLowerCase()
        ) {
          await tokenA.approve(
            DCAPairSwapHandler.address,
            amountToBeProvidedExternally
          );
        } else {
          await tokenB.approve(
            DCAPairSwapHandler.address,
            amountToBeProvidedExternally
          );
        }
        this.swapTx = DCAPairSwapHandler.swap();
      });
      then('tx is not reverted', async function () {
        await expect(this.swapTx).to.not.be.reverted;
      });
      then('external amount of token needed is provided', async function () {
        if (
          tokenToBeProvidedExternally().toLowerCase() ===
          tokenA.address.toLowerCase()
        ) {
          expect(await tokenA.balanceOf(DCAPairSwapHandler.address)).to.equal(
            this.initialContractTokenABalance.add(amountToBeProvidedExternally)
          );
        } else {
          expect(await tokenB.balanceOf(DCAPairSwapHandler.address)).to.equal(
            this.initialContractTokenBBalance.add(amountToBeProvidedExternally)
          );
        }
      });
      then('external amount of token is taken from swapper', async function () {
        if (tokenToBeProvidedExternally() === tokenA.address) {
          expect(await tokenA.balanceOf(owner.address)).to.equal(
            this.initialSwapperTokenABalance.sub(amountToBeProvidedExternally)
          );
        } else {
          expect(await tokenB.balanceOf(owner.address)).to.equal(
            this.initialSwapperTokenBBalance.sub(amountToBeProvidedExternally)
          );
        }
      });
      then(
        'register swaps from tokenA to tokenB with correct information',
        async function () {
          expect(
            await DCAPairSwapHandler.swapAmountAccumulator(tokenA.address)
          ).to.equal(amountToSwapOfTokenA);
          expect(
            await DCAPairSwapHandler.accumRatesPerUnit(
              tokenA.address,
              nextSwapToPerform,
              0
            )
          ).to.not.equal(0);
        }
      );
      then(
        'register swaps from tokenB to tokenA with correct information',
        async function () {
          expect(
            await DCAPairSwapHandler.swapAmountAccumulator(tokenB.address)
          ).to.equal(amountToSwapOfTokenB);
          expect(
            await DCAPairSwapHandler.accumRatesPerUnit(
              tokenB.address,
              nextSwapToPerform,
              0
            )
          ).to.not.equal(0);
        }
      );
      then('updates performed swaps', async function () {
        expect(await DCAPairSwapHandler.performedSwaps()).to.equal(
          nextSwapToPerform
        );
      });
      then('updates last swap performend timestamp', async function () {
        expect(await DCAPairSwapHandler.lastSwapPerformed()).to.be.gt(
          this.initialLastSwapPerformed
        );
      });
      then('emits event with correct information', async function () {
        const transactionResponse = await this.swapTx;
        expect(
          await readArgFromEvent(
            transactionResponse,
            'Swapped',
            '_swapToPerform'
          )
        ).to.equal(nextSwapToPerform);
        expect(
          await readArgFromEvent(
            transactionResponse,
            'Swapped',
            '_amountToSwapTokenA'
          )
        ).to.equal(amountToSwapOfTokenA);
        expect(
          await readArgFromEvent(
            transactionResponse,
            'Swapped',
            '_amountToSwapTokenB'
          )
        ).to.equal(amountToSwapOfTokenB);
        expect(
          await readArgFromEvent(
            transactionResponse,
            'Swapped',
            '_ratePerUnitBToA'
          )
        ).to.equal(ratePerUnitBToA);
        expect(
          await readArgFromEvent(
            transactionResponse,
            'Swapped',
            '_ratePerUnitAToB'
          )
        ).to.equal(ratePerUnitAToB);
        expect(
          await readArgFromEvent(
            transactionResponse,
            'Swapped',
            '_amountToBeProvidedExternally'
          )
        ).to.equal(amountToBeProvidedExternally);
        expect(
          await readArgFromEvent(
            transactionResponse,
            'Swapped',
            '_tokenToBeProvidedExternally'
          )
        ).to.equal(tokenToBeProvidedExternally());
      });
    });
  }
});
