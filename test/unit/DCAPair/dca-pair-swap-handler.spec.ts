import moment from 'moment';
import { expect } from 'chai';
import { BigNumber, Contract, ContractFactory, Signer, utils } from 'ethers';
import { ethers } from 'hardhat';
import { constants, uniswap, erc20, behaviours, evm } from '../../utils';

const MINIMUM_SWAP_INTERVAL = ethers.BigNumber.from('60');

describe('DCAPairSwapHandler', function () {
  let owner: Signer, feeRecipient: Signer;
  let token0: Contract, token1: Contract;
  let DCAPairSwapHandlerContract: ContractFactory;
  let DCAPairSwapHandler: Contract;
  const token1Decimals = 18;
  const magnitude = ethers.BigNumber.from(10).pow(token1Decimals);

  const swapInterval = moment.duration(1, 'days').as('seconds');

  before('Setup accounts and contracts', async () => {
    [owner, feeRecipient] = await ethers.getSigners();
    DCAPairSwapHandlerContract = await ethers.getContractFactory(
      'contracts/mocks/DCAPair/DCAPairSwapHandler.sol:DCAPairSwapHandlerMock'
    );
  });

  beforeEach('Deploy and configure', async () => {
    await evm.reset();
    await uniswap.deploy({
      owner,
    });
    token0 = await erc20.deploy({
      name: 'token0',
      symbol: 'TKN0',
      initialAccount: await owner.getAddress(),
      initialAmount: utils.parseEther('10000000000000'),
    });
    token1 = await erc20.deploy({
      name: 'token1',
      symbol: 'TKN1',
      initialAccount: await owner.getAddress(),
      initialAmount: utils.parseEther('10000000000000'),
    });
    DCAPairSwapHandler = await DCAPairSwapHandlerContract.deploy(
      token0.address,
      token1.address,
      uniswap.getUniswapV2Router02().address,
      constants.NOT_ZERO_ADDRESS, // factory
      swapInterval
    );
  });

  describe('constructor', () => {
    context('when swap interval is less than MINIMUM_SWAP_INTERVAL', () => {
      it('reverts with message', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: DCAPairSwapHandlerContract,
          args: [
            token0.address,
            token1.address,
            uniswap.getUniswapV2Router02().address,
            constants.NOT_ZERO_ADDRESS, // factory
            MINIMUM_SWAP_INTERVAL.sub(1),
          ],
          message: 'DCAPair: interval too short',
        });
      });
    });
    context('when factory is zero', () => {
      it('reverts with message', async () => {
        await behaviours.deployShouldRevertWithZeroAddress({
          contract: DCAPairSwapHandlerContract,
          args: [
            token0.address,
            token1.address,
            uniswap.getUniswapV2Router02().address,
            constants.ZERO_ADDRESS,
            MINIMUM_SWAP_INTERVAL,
          ],
        });
      });
    });
    context('when all arguments are valid', () => {
      it('initizalizes correctly and emits events', async () => {
        await behaviours.deployShouldSetVariablesAndEmitEvents({
          contract: DCAPairSwapHandlerContract,
          args: [
            token0.address,
            token1.address,
            uniswap.getUniswapV2Router02().address,
            constants.NOT_ZERO_ADDRESS, // factory
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
          DCAPairSwapHandler.setSwapInterval(MINIMUM_SWAP_INTERVAL.sub(1))
        ).to.be.revertedWith('DCAPair: interval too short');
      });
    });
    context('when swap interval is more than MINIMUM_SWAP_INTERVAL', () => {
      it('sets new value, and emits event with correct args', async () => {
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

  describe('_swap', () => {
    context('when last swap was < than swap interval ago', () => {
      beforeEach(async () => {
        await DCAPairSwapHandler.setLastSwapPerformed(moment().unix());
      });
      it('reverts with message', async () => {
        await expect(DCAPairSwapHandler.swap()).to.be.revertedWith(
          'DCAPair: within swap interval'
        );
      });
    });
    context('when some fonky stuff happend and wants to buy negative', () => {
      beforeEach(async () => {
        await DCAPairSwapHandler.setSwapAmountDelta(
          ethers.BigNumber.from('1'),
          ethers.BigNumber.from('-10')
        );
      });
      it('reverts with message', async () => {
        await expect(DCAPairSwapHandler.swap()).to.be.revertedWith(
          'DCAPair: amount should be > 0'
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
            token0: token1,
            token1: token0,
          });
          // we try to maximize rate per unit to overflow
          await uniswap.addLiquidity({
            owner,
            token0: token0,
            amountA: utils.parseEther('100'), //10e18
            token1: token1,
            amountB: utils.parseEther('1000'), //10e21
          });
          await DCAPairSwapHandler.setSwapAmountAccumulator(amountToSwap);
          await token0.transfer(
            DCAPairSwapHandler.address,
            uniswapRatePerUnit.mul(amountOfSwaps)
          );
        });
        it('stores accumulated rates per unit, increases performed swaps and emits event', async () => {
          for (let i = 0; i < amountOfSwaps; i++) {
            const previousBalance = await token1.balanceOf(
              DCAPairSwapHandler.address
            );
            const previousAverageRatePerUnit = await DCAPairSwapHandler.accumRatesPerUnit(
              await DCAPairSwapHandler.performedSwaps(),
              0
            );
            const previousOverflowGuard = await DCAPairSwapHandler.accumRatesPerUnit(
              await DCAPairSwapHandler.performedSwaps(),
              1
            );
            expect(previousBalance).to.equal(uniswapRatePerUnit.mul(i));
            expect(previousOverflowGuard).to.equal(0);
            expect(previousAverageRatePerUnit).to.equal(
              uniswapRatePerUnit.mul(magnitude).div(amountToSwap).mul(i)
            );
            await expect(DCAPairSwapHandler.swap())
              .to.emit(DCAPairSwapHandler, 'Swapped')
              .withArgs(
                amountToSwap,
                uniswapRatePerUnit,
                uniswapRatePerUnit.mul(magnitude).div(amountToSwap)
              );
            const postBalance = await token1.balanceOf(
              DCAPairSwapHandler.address
            );
            const postAverageRatePerUnit = await DCAPairSwapHandler.accumRatesPerUnit(
              await DCAPairSwapHandler.performedSwaps(),
              0
            );
            const postOverflowGuard = await DCAPairSwapHandler.accumRatesPerUnit(
              await DCAPairSwapHandler.performedSwaps(),
              1
            );
            expect(postBalance).to.equal(
              previousBalance.add(uniswapRatePerUnit)
            );
            expect(postOverflowGuard).to.equal(previousOverflowGuard);
            expect(postAverageRatePerUnit).to.equal(
              previousAverageRatePerUnit.add(
                uniswapRatePerUnit.mul(magnitude).div(amountToSwap)
              )
            );
          }
        });
      }
    );
    context('when the addition overflows averages rates per unit', () => {
      // 1 of any token with to token decimals
      const missingToOverflow = ethers.BigNumber.from('10').pow(token1Decimals);
      // amount to swap
      const amountToSwap = ethers.BigNumber.from('1');
      // performed swaps
      const performedSwaps = ethers.BigNumber.from('2');
      // rate per unit. TODO: Should be calculated programatically based on uniswap
      // liquidity
      const uniswapRatePerUnit = ethers.BigNumber.from('996');
      beforeEach(async () => {
        await uniswap.createPair({
          token0: token1,
          token1: token0,
        });
        // we try to maximize rate per unit to overflow
        await uniswap.addLiquidity({
          owner,
          token0: token0,
          amountA: utils.parseEther('1'), //10e18
          token1: token1,
          amountB: utils.parseEther('1000'), //10e21
        });
        await DCAPairSwapHandler.setAverageRatesPerUnit(performedSwaps, [
          ethers.constants.MaxUint256.sub(missingToOverflow),
          ethers.BigNumber.from('0'),
        ]);
        await DCAPairSwapHandler.setPerformedSwaps(performedSwaps);
        await DCAPairSwapHandler.setSwapAmountAccumulator(amountToSwap);
        await token0.transfer(DCAPairSwapHandler.address, amountToSwap);
      });
      it('stores delta to overflowing, increases overflow multiplier, performed swaps and emits event', async () => {
        const previousAverageRatePerUnit = await DCAPairSwapHandler.accumRatesPerUnit(
          performedSwaps,
          0
        );
        const previousOverflowGuard = await DCAPairSwapHandler.accumRatesPerUnit(
          performedSwaps,
          1
        );
        expect(await token1.balanceOf(DCAPairSwapHandler.address)).to.equal(0);
        await expect(DCAPairSwapHandler.swap())
          .to.emit(DCAPairSwapHandler, 'Swapped')
          .withArgs(
            amountToSwap,
            uniswapRatePerUnit,
            uniswapRatePerUnit.mul(magnitude).div(amountToSwap)
          );
        expect(await token1.balanceOf(DCAPairSwapHandler.address)).to.equal(
          amountToSwap.mul(uniswapRatePerUnit)
        );
        const postAverageRatePerUnit = await DCAPairSwapHandler.accumRatesPerUnit(
          performedSwaps.add(1),
          0
        );
        const postOverflowGuard = await DCAPairSwapHandler.accumRatesPerUnit(
          performedSwaps.add(1),
          1
        );
        expect(previousAverageRatePerUnit).to.equal(
          await DCAPairSwapHandler.accumRatesPerUnit(performedSwaps, 0)
        );
        expect(postAverageRatePerUnit).to.equal(
          uniswapRatePerUnit
            .mul(magnitude)
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
