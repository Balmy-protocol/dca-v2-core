import moment from 'moment';
import { expect } from 'chai';
import { BigNumber, Contract, ContractFactory, Signer, utils } from 'ethers';
import { ethers } from 'hardhat';
import { constants, uniswap, erc20, behaviours, evm } from '../utils';

const MAGNITUDE = ethers.BigNumber.from('10').pow('18');
const MINIMUM_SWAP_INTERVAL = ethers.BigNumber.from('60');
const OVERFLOW_GUARD = ethers.BigNumber.from('2').pow('250');

describe.only('DDCASwapHandler', function () {
  let owner: Signer, feeRecipient: Signer;
  let fromToken: Contract, toToken: Contract;
  let DDCASwapHandlerContract: ContractFactory, DDCASwapHandler: Contract;

  const swapInterval = moment.duration(1, 'days').as('seconds');

  before('Setup accounts and contracts', async () => {
    [owner, feeRecipient] = await ethers.getSigners();
    DDCASwapHandlerContract = await ethers.getContractFactory(
      'contracts/mocks/DDCA/DDCASwapHandler.sol:DDCASwapHandlerMock'
    );
  });

  beforeEach('Deploy and configure', async () => {
    await evm.reset();
    await uniswap.deploy({
      owner,
    });
    fromToken = await erc20.deploy({
      name: 'DAI',
      symbol: 'DAI',
      initialAccount: await owner.getAddress(),
      initialAmount: utils.parseEther('10000000000000'),
    });
    toToken = await erc20.deploy({
      name: 'DAI2',
      symbol: 'DAI2',
      initialAccount: await owner.getAddress(),
      initialAmount: utils.parseEther('10000000000000'),
    });
    DDCASwapHandler = await DDCASwapHandlerContract.deploy(
      await feeRecipient.getAddress(),
      fromToken.address,
      toToken.address,
      uniswap.getUniswapV2Router02().address,
      swapInterval
    );
  });

  describe('constructor', () => {
    context('when swap interval is less than MINIMUM_SWAP_INTERVAL', () => {
      it('reverts with message');
    });
    context('when all arguments are valid', () => {
      it('initizalizes correctly and emits events');
    });
  });

  describe('_setSwapInterval', () => {
    context('when swap interval is less than MINIMUM_SWAP_INTERVAL', () => {
      it('reverts with message', async () => {
        await expect(
          DDCASwapHandler.setSwapInterval(MINIMUM_SWAP_INTERVAL.sub(1))
        ).to.be.revertedWith('DDCASH: interval too short');
      });
    });
    context('when swap interval is more than MINIMUM_SWAP_INTERVAL', () => {
      it('sets new value, and emits event with correct args', async () => {
        await behaviours.shouldSetVariableAndEmitEvent({
          contract: DDCASwapHandler,
          getterFunc: 'swapInterval',
          setterFunc: 'setSwapInterval',
          variable: MINIMUM_SWAP_INTERVAL,
          eventEmitted: 'SwapIntervalSet',
        });
      });
    });
  });

  describe('_swap', () => {
    context('when last swap was < than swap interval ago', () => {
      beforeEach(async () => {
        await DDCASwapHandler.setLastSwapPerformed(moment().unix());
      });
      it('reverts with message', async () => {
        await expect(DDCASwapHandler.swap()).to.be.revertedWith(
          'DDCASH: within swap interval'
        );
      });
    });
    context('when some fonky stuff happend and wants to buy negative', () => {
      beforeEach(async () => {
        await DDCASwapHandler.setSwapAmountDelta(
          ethers.BigNumber.from('1'),
          ethers.BigNumber.from('-10')
        );
      });
      it('reverts with message', async () => {
        await expect(DDCASwapHandler.swap()).to.be.revertedWith(
          'DDCASH: amount should be > 0'
        );
      });
    });
    context(
      'when the addition does not overflow averages rates per unit',
      () => {
        // amount to swap
        const amountToSwap = ethers.BigNumber.from('1');
        // rate per unit. TODO: Should be calculated programatically based on uniswap
        // liquidity
        const uniswapRatePerUnit = ethers.BigNumber.from('9');
        // amount of swaps
        const amountOfSwaps = 10;
        beforeEach(async () => {
          await uniswap.createPair({
            tokenA: toToken,
            tokenB: fromToken,
          });
          // we try to maximize rate per unit to overflow
          await uniswap.addLiquidity({
            owner,
            tokenA: fromToken,
            amountA: utils.parseEther('100'), //10e18
            tokenB: toToken,
            amountB: utils.parseEther('1000'), //10e21
          });
          await DDCASwapHandler.setSwapAmountAccumulator(amountToSwap);
          await fromToken.transfer(
            DDCASwapHandler.address,
            uniswapRatePerUnit.mul(amountOfSwaps)
          );
        });
        it('stores accumulated rates per unit, increases performed swaps and emits event', async () => {
          for (let i = 0; i < amountOfSwaps; i++) {
            const previousBalance = await toToken.balanceOf(
              DDCASwapHandler.address
            );
            const previousAverageRatePerUnit = await DDCASwapHandler.accumRatesPerUnit(
              await DDCASwapHandler.performedSwaps(),
              0
            );
            const previousOverflowGuard = await DDCASwapHandler.accumRatesPerUnit(
              await DDCASwapHandler.performedSwaps(),
              1
            );
            expect(previousBalance).to.equal(uniswapRatePerUnit.mul(i));
            expect(previousOverflowGuard).to.equal(0);
            expect(previousAverageRatePerUnit).to.equal(
              uniswapRatePerUnit.mul(MAGNITUDE).div(amountToSwap).mul(i)
            );
            await expect(DDCASwapHandler.swap())
              .to.emit(DDCASwapHandler, 'Swapped')
              .withArgs(
                amountToSwap,
                uniswapRatePerUnit,
                uniswapRatePerUnit.mul(MAGNITUDE).div(amountToSwap)
              );
            const postBalance = await toToken.balanceOf(
              DDCASwapHandler.address
            );
            const postAverageRatePerUnit = await DDCASwapHandler.accumRatesPerUnit(
              await DDCASwapHandler.performedSwaps(),
              0
            );
            const postOverflowGuard = await DDCASwapHandler.accumRatesPerUnit(
              await DDCASwapHandler.performedSwaps(),
              1
            );
            expect(postBalance).to.equal(
              previousBalance.add(uniswapRatePerUnit)
            );
            expect(postOverflowGuard).to.equal(previousOverflowGuard);
            expect(postAverageRatePerUnit).to.equal(
              previousAverageRatePerUnit.add(
                uniswapRatePerUnit.mul(MAGNITUDE).div(amountToSwap)
              )
            );
          }
        });
      }
    );
    context('when the addition overflows averages rates per unit', () => {
      // 1 of any token with 18 decimals
      const missingToOverflow = ethers.BigNumber.from('10').pow('18');
      // amount to swap
      const amountToSwap = ethers.BigNumber.from('1');
      // performed swaps
      const performedSwaps = ethers.BigNumber.from('2');
      // rate per unit. TODO: Should be calculated programatically based on uniswap
      // liquidity
      const uniswapRatePerUnit = ethers.BigNumber.from('996');
      beforeEach(async () => {
        await uniswap.createPair({
          tokenA: toToken,
          tokenB: fromToken,
        });
        // we try to maximize rate per unit to overflow
        await uniswap.addLiquidity({
          owner,
          tokenA: fromToken,
          amountA: utils.parseEther('1'), //10e18
          tokenB: toToken,
          amountB: utils.parseEther('1000'), //10e21
        });
        await DDCASwapHandler.setAverageRatesPerUnit(performedSwaps, [
          OVERFLOW_GUARD.sub(missingToOverflow),
          ethers.BigNumber.from('0'),
        ]);
        await DDCASwapHandler.setPerformedSwaps(performedSwaps);
        await DDCASwapHandler.setSwapAmountAccumulator(amountToSwap);
        await fromToken.transfer(DDCASwapHandler.address, amountToSwap);
      });
      it('stores delta to overflowing, increases overflow multiplier, performed swaps and emits event', async () => {
        const previousAverageRatePerUnit = await DDCASwapHandler.accumRatesPerUnit(
          performedSwaps,
          0
        );
        const previousOverflowGuard = await DDCASwapHandler.accumRatesPerUnit(
          performedSwaps,
          1
        );
        expect(await toToken.balanceOf(DDCASwapHandler.address)).to.equal(0);
        await expect(DDCASwapHandler.swap())
          .to.emit(DDCASwapHandler, 'Swapped')
          .withArgs(
            amountToSwap,
            uniswapRatePerUnit,
            uniswapRatePerUnit.mul(MAGNITUDE).div(amountToSwap)
          );
        expect(await toToken.balanceOf(DDCASwapHandler.address)).to.equal(
          amountToSwap.mul(uniswapRatePerUnit)
        );
        const postAverageRatePerUnit = await DDCASwapHandler.accumRatesPerUnit(
          performedSwaps.add(1),
          0
        );
        const postOverflowGuard = await DDCASwapHandler.accumRatesPerUnit(
          performedSwaps.add(1),
          1
        );
        expect(previousAverageRatePerUnit).to.equal(
          await DDCASwapHandler.accumRatesPerUnit(performedSwaps, 0)
        );
        expect(postAverageRatePerUnit).to.equal(
          uniswapRatePerUnit
            .mul(MAGNITUDE)
            .div(amountToSwap)
            .sub(missingToOverflow)
        );
        expect(postOverflowGuard).to.equal(previousOverflowGuard.add(1));
      });
    });
  });

  describe('_uniswapSwap', () => {
    it('correctly swaps indicated value from token to token');
  });
});
