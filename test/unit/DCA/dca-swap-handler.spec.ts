import moment from 'moment';
import { expect } from 'chai';
import { BigNumber, Contract, ContractFactory, Signer, utils } from 'ethers';
import { ethers } from 'hardhat';
import { constants, uniswap, erc20, behaviours, evm } from '../../utils';

const MAGNITUDE = ethers.BigNumber.from('10').pow('18');
const MINIMUM_SWAP_INTERVAL = ethers.BigNumber.from('60');
const OVERFLOW_GUARD = ethers.BigNumber.from('2').pow('250');

describe('DCASwapHandler', function () {
  let owner: Signer, feeRecipient: Signer;
  let fromToken: Contract, toToken: Contract;
  let DCASwapHandlerContract: ContractFactory, DCASwapHandler: Contract;

  const swapInterval = moment.duration(1, 'days').as('seconds');

  before('Setup accounts and contracts', async () => {
    [owner, feeRecipient] = await ethers.getSigners();
    DCASwapHandlerContract = await ethers.getContractFactory(
      'contracts/mocks/DCA/DCASwapHandler.sol:DCASwapHandlerMock'
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
    DCASwapHandler = await DCASwapHandlerContract.deploy(
      await feeRecipient.getAddress(),
      fromToken.address,
      toToken.address,
      uniswap.getUniswapV2Router02().address,
      swapInterval
    );
  });

  describe('constructor', () => {
    context('when swap interval is less than MINIMUM_SWAP_INTERVAL', () => {
      it('reverts with message', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: DCASwapHandlerContract,
          args: [
            await feeRecipient.getAddress(),
            fromToken.address,
            toToken.address,
            uniswap.getUniswapV2Router02().address,
            MINIMUM_SWAP_INTERVAL.sub(1),
          ],
          message: 'DCASH: interval too short',
        });
      });
    });
    context('when all arguments are valid', () => {
      it('initizalizes correctly and emits events', async () => {
        await behaviours.deployShouldSetVariablesAndEmitEvents({
          contract: DCASwapHandlerContract,
          args: [
            await feeRecipient.getAddress(),
            fromToken.address,
            toToken.address,
            uniswap.getUniswapV2Router02().address,
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

  describe('_setSwapInterval', () => {
    context('when swap interval is less than MINIMUM_SWAP_INTERVAL', () => {
      it('reverts with message', async () => {
        await expect(
          DCASwapHandler.setSwapInterval(MINIMUM_SWAP_INTERVAL.sub(1))
        ).to.be.revertedWith('DCASH: interval too short');
      });
    });
    context('when swap interval is more than MINIMUM_SWAP_INTERVAL', () => {
      it('sets new value, and emits event with correct args', async () => {
        await behaviours.txShouldSetVariableAndEmitEvent({
          contract: DCASwapHandler,
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
        await DCASwapHandler.setLastSwapPerformed(moment().unix());
      });
      it('reverts with message', async () => {
        await expect(DCASwapHandler.swap()).to.be.revertedWith(
          'DCASH: within swap interval'
        );
      });
    });
    context('when some fonky stuff happend and wants to buy negative', () => {
      beforeEach(async () => {
        await DCASwapHandler.setSwapAmountDelta(
          ethers.BigNumber.from('1'),
          ethers.BigNumber.from('-10')
        );
      });
      it('reverts with message', async () => {
        await expect(DCASwapHandler.swap()).to.be.revertedWith(
          'DCASH: amount should be > 0'
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
          await DCASwapHandler.setSwapAmountAccumulator(amountToSwap);
          await fromToken.transfer(
            DCASwapHandler.address,
            uniswapRatePerUnit.mul(amountOfSwaps)
          );
        });
        it('stores accumulated rates per unit, increases performed swaps and emits event', async () => {
          for (let i = 0; i < amountOfSwaps; i++) {
            const previousBalance = await toToken.balanceOf(
              DCASwapHandler.address
            );
            const previousAverageRatePerUnit = await DCASwapHandler.accumRatesPerUnit(
              await DCASwapHandler.performedSwaps(),
              0
            );
            const previousOverflowGuard = await DCASwapHandler.accumRatesPerUnit(
              await DCASwapHandler.performedSwaps(),
              1
            );
            expect(previousBalance).to.equal(uniswapRatePerUnit.mul(i));
            expect(previousOverflowGuard).to.equal(0);
            expect(previousAverageRatePerUnit).to.equal(
              uniswapRatePerUnit.mul(MAGNITUDE).div(amountToSwap).mul(i)
            );
            await expect(DCASwapHandler.swap())
              .to.emit(DCASwapHandler, 'Swapped')
              .withArgs(
                amountToSwap,
                uniswapRatePerUnit,
                uniswapRatePerUnit.mul(MAGNITUDE).div(amountToSwap)
              );
            const postBalance = await toToken.balanceOf(DCASwapHandler.address);
            const postAverageRatePerUnit = await DCASwapHandler.accumRatesPerUnit(
              await DCASwapHandler.performedSwaps(),
              0
            );
            const postOverflowGuard = await DCASwapHandler.accumRatesPerUnit(
              await DCASwapHandler.performedSwaps(),
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
        await DCASwapHandler.setAverageRatesPerUnit(performedSwaps, [
          OVERFLOW_GUARD.sub(missingToOverflow),
          ethers.BigNumber.from('0'),
        ]);
        await DCASwapHandler.setPerformedSwaps(performedSwaps);
        await DCASwapHandler.setSwapAmountAccumulator(amountToSwap);
        await fromToken.transfer(DCASwapHandler.address, amountToSwap);
      });
      it('stores delta to overflowing, increases overflow multiplier, performed swaps and emits event', async () => {
        const previousAverageRatePerUnit = await DCASwapHandler.accumRatesPerUnit(
          performedSwaps,
          0
        );
        const previousOverflowGuard = await DCASwapHandler.accumRatesPerUnit(
          performedSwaps,
          1
        );
        expect(await toToken.balanceOf(DCASwapHandler.address)).to.equal(0);
        await expect(DCASwapHandler.swap())
          .to.emit(DCASwapHandler, 'Swapped')
          .withArgs(
            amountToSwap,
            uniswapRatePerUnit,
            uniswapRatePerUnit.mul(MAGNITUDE).div(amountToSwap)
          );
        expect(await toToken.balanceOf(DCASwapHandler.address)).to.equal(
          amountToSwap.mul(uniswapRatePerUnit)
        );
        const postAverageRatePerUnit = await DCASwapHandler.accumRatesPerUnit(
          performedSwaps.add(1),
          0
        );
        const postOverflowGuard = await DCASwapHandler.accumRatesPerUnit(
          performedSwaps.add(1),
          1
        );
        expect(previousAverageRatePerUnit).to.equal(
          await DCASwapHandler.accumRatesPerUnit(performedSwaps, 0)
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
