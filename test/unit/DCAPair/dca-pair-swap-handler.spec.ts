import moment from 'moment';
import { expect } from 'chai';
import { BigNumber, Contract, ContractFactory, Signer, utils } from 'ethers';
import { ethers } from 'hardhat';
import { constants, uniswap, erc20, behaviours, evm } from '../../utils';

const MINIMUM_SWAP_INTERVAL = ethers.BigNumber.from('60');

describe('DCAPairSwapHandler', function () {
  let owner: Signer, feeRecipient: Signer;
  let fromToken: Contract, toToken: Contract;
  let DCAPairSwapHandlerContract: ContractFactory;
  let DCAPairSwapHandler: Contract;
  const toTokenDecimals = 18;
  const magnitude = ethers.BigNumber.from(10).pow(toTokenDecimals);

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
    fromToken = await erc20.deploy({
      name: 'fromToken',
      symbol: 'TKN0',
      initialAccount: await owner.getAddress(),
      initialAmount: utils.parseEther('10000000000000'),
    });
    toToken = await erc20.deploy({
      name: 'toToken',
      symbol: 'TKN1',
      initialAccount: await owner.getAddress(),
      initialAmount: utils.parseEther('10000000000000'),
    });
    DCAPairSwapHandler = await DCAPairSwapHandlerContract.deploy(
      fromToken.address,
      toToken.address,
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
            fromToken.address,
            toToken.address,
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
            fromToken.address,
            toToken.address,
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
            fromToken.address,
            toToken.address,
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
            swapAmountAccumulator
          );
          for (let i = 1; i <= 10; i++) {
            swapAmountDeltas.push(
              ethers.BigNumber.from(`${getRandomInt(1, 9999999999)}`)
            );
            await DCAPairSwapHandler.setSwapAmountDelta(
              ethers.BigNumber.from(i),
              swapAmountDeltas[i - 1]
            );
          }
        });
        it('returns augments amount to swap', async () => {
          for (let i = 1; i <= 10; i++) {
            expect(await DCAPairSwapHandler.swapAmountAccumulator()).to.equal(
              swapAmountAccumulator
            );
            const amountToSwap = swapAmountAccumulator.add(
              swapAmountDeltas[i - 1]
            );
            expect(amountToSwap).to.be.gt(swapAmountAccumulator);
            expect(await DCAPairSwapHandler.getAmountToSwap(i)).to.equal(
              amountToSwap
            );
            await DCAPairSwapHandler.setSwapAmountAccumulator(amountToSwap);
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
          const swap = ethers.BigNumber.from('1');
          beforeEach(async () => {
            await DCAPairSwapHandler.setSwapAmountAccumulator(
              swapAmountAccumulator
            );
            await DCAPairSwapHandler.setSwapAmountDelta(swap, swapAmountDelta);
          });
          it('calculates correctly the final amount to buy', async () => {
            expect(await DCAPairSwapHandler.swapAmountAccumulator()).to.equal(
              swapAmountAccumulator
            );
            const amountToSwap = await DCAPairSwapHandler.getAmountToSwap(swap);
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
              swapAmountAccumulator
            );
            for (let i = 1; i <= 10; i++) {
              swapAmountDeltas.push(
                ethers.BigNumber.from(
                  `${Math.floor(Math.random() * 1000000) - 999999}`
                )
              );
              await DCAPairSwapHandler.setSwapAmountDelta(
                ethers.BigNumber.from(i),
                swapAmountDeltas[i - 1]
              );
            }
          });
          it('returns reduced amount to swap', async () => {
            for (let i = 1; i <= 10; i++) {
              expect(await DCAPairSwapHandler.swapAmountAccumulator()).to.equal(
                swapAmountAccumulator
              );
              const amountToSwap = swapAmountAccumulator.add(
                swapAmountDeltas[i - 1]
              );
              expect(amountToSwap).to.be.lt(swapAmountAccumulator);
              expect(await DCAPairSwapHandler.getAmountToSwap(i)).to.equal(
                amountToSwap
              );
              await DCAPairSwapHandler.setSwapAmountAccumulator(amountToSwap);
              swapAmountAccumulator = amountToSwap;
            }
          });
        });
      }
    );
  });

  describe('_addNewRatePerUnit', () => {
    context('when is first swap', () => {
      it('saves the information correctly', async () => {
        const swap = ethers.BigNumber.from('1');
        const ratePerUnit = ethers.BigNumber.from('194921');
        expect(await DCAPairSwapHandler.accumRatesPerUnit(swap, 0)).to.equal(0);
        expect(await DCAPairSwapHandler.accumRatesPerUnit(swap, 1)).to.equal(0);
        await DCAPairSwapHandler.addNewRatePerUnit(swap, ratePerUnit);
        expect(await DCAPairSwapHandler.accumRatesPerUnit(swap, 0)).to.equal(
          ratePerUnit
        );
        expect(await DCAPairSwapHandler.accumRatesPerUnit(swap, 1)).to.equal(0);
      });
    });
    context('when is not the first swap', () => {
      const swap = ethers.BigNumber.from('3');
      context(
        'when the addition does not overflow the accumulated rates per unit',
        () => {
          const lastAcummRatePerUnit = ethers.constants.MaxUint256.div(2);
          beforeEach(async () => {
            await DCAPairSwapHandler.setAcummRatesPerUnit(swap.sub(1), [
              lastAcummRatePerUnit,
              ethers.BigNumber.from('0'),
            ]);
          });
          it('increases the accumulated rates per unit without modifying the overflown accumulator', async () => {
            const ratePerUnit = ethers.constants.MaxUint256.div(2).sub(1);
            expect(
              await DCAPairSwapHandler.accumRatesPerUnit(swap, 0)
            ).to.equal(0);
            expect(
              await DCAPairSwapHandler.accumRatesPerUnit(swap.sub(1), 0)
            ).to.equal(lastAcummRatePerUnit);
            expect(
              await DCAPairSwapHandler.accumRatesPerUnit(swap, 1)
            ).to.equal(0);
            await DCAPairSwapHandler.addNewRatePerUnit(swap, ratePerUnit);
            expect(
              await DCAPairSwapHandler.accumRatesPerUnit(swap, 0)
            ).to.equal(lastAcummRatePerUnit.add(ratePerUnit));
            expect(
              await DCAPairSwapHandler.accumRatesPerUnit(swap, 1)
            ).to.equal(0);
          });
        }
      );

      context(
        'when the addition overflows the accumulated rates per unit',
        () => {
          const lastAcummRatePerUnit = ethers.constants.MaxUint256.div(2);
          beforeEach(async () => {
            await DCAPairSwapHandler.setAcummRatesPerUnit(swap.sub(1), [
              lastAcummRatePerUnit,
              ethers.BigNumber.from('0'),
            ]);
          });
          it('increases the accumulated rates per unit accordingly and modifies the overflown accumulator', async () => {
            const ratePerUnit = ethers.constants.MaxUint256.div(2).add(
              ethers.constants.MaxUint256.div(3)
            );
            expect(
              await DCAPairSwapHandler.accumRatesPerUnit(swap, 0)
            ).to.equal(0);
            expect(
              await DCAPairSwapHandler.accumRatesPerUnit(swap.sub(1), 0)
            ).to.equal(lastAcummRatePerUnit);
            expect(
              await DCAPairSwapHandler.accumRatesPerUnit(swap, 1)
            ).to.equal(0);
            await DCAPairSwapHandler.addNewRatePerUnit(swap, ratePerUnit);

            const previouslyMissingToOverflow = ethers.constants.MaxUint256.sub(
              lastAcummRatePerUnit
            );
            expect(
              await DCAPairSwapHandler.accumRatesPerUnit(swap.sub(1), 0)
            ).to.equal(lastAcummRatePerUnit);
            expect(
              await DCAPairSwapHandler.accumRatesPerUnit(swap.sub(1), 1)
            ).to.equal(0);
            expect(
              await DCAPairSwapHandler.accumRatesPerUnit(swap, 0)
            ).to.equal(ratePerUnit.sub(previouslyMissingToOverflow));
            expect(
              await DCAPairSwapHandler.accumRatesPerUnit(swap, 1)
            ).to.equal(1);
            expect(ratePerUnit.add(lastAcummRatePerUnit)).to.equal(
              ethers.constants.MaxUint256.add(
                ratePerUnit.sub(previouslyMissingToOverflow)
              )
            );
          });
        }
      );
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
    context('when last swap was > than swap interval ago', () => {
      const swapAmountAccumulator = utils.parseEther('1');
      const swapAmountDelta = utils.parseEther('0.1');
      const swap = ethers.BigNumber.from('2');
      const uniswapRatePerUnit = ethers.BigNumber.from('986184514430243519');
      beforeEach(async () => {
        await uniswap.createPair({
          token0: toToken,
          token1: fromToken,
        });
        await uniswap.addLiquidity({
          owner,
          token0: fromToken,
          amountA: utils.parseEther('100'),
          token1: toToken,
          amountB: utils.parseEther('100'),
        });
        await fromToken.transfer(
          DCAPairSwapHandler.address,
          swapAmountAccumulator.mul(100)
        );
        await DCAPairSwapHandler.setSwapAmountAccumulator(
          swapAmountAccumulator
        );
        await DCAPairSwapHandler.setPerformedSwaps(swap.sub(1));
        await DCAPairSwapHandler.setSwapAmountDelta(swap, swapAmountDelta);
      });
      it('updates swap accumulator', async () => {
        const initialSwapAmountAccumulator = await DCAPairSwapHandler.swapAmountAccumulator();
        const amountToSwap = await DCAPairSwapHandler.getAmountToSwap(swap);
        expect(initialSwapAmountAccumulator).to.equal(swapAmountAccumulator);
        await DCAPairSwapHandler.swap();
        expect(await DCAPairSwapHandler.swapAmountAccumulator()).to.equal(
          amountToSwap
        );
      });
      it('performs swap', async () => {
        const initialFromTokenBalance = await fromToken.balanceOf(
          DCAPairSwapHandler.address
        );
        const initialToTokenBalance = await toToken.balanceOf(
          DCAPairSwapHandler.address
        );
        await DCAPairSwapHandler.swap();
        const soldFromToken = swapAmountAccumulator.add(swapAmountDelta);
        const boughtToToken = soldFromToken
          .mul(uniswapRatePerUnit)
          .div(ethers.BigNumber.from('10').pow('18'))
          .add(1);
        expect(
          await fromToken.balanceOf(DCAPairSwapHandler.address)
        ).to.be.equal(initialFromTokenBalance.sub(soldFromToken));
        expect(await fromToken.balanceOf(DCAPairSwapHandler.address)).to.be.lt(
          initialFromTokenBalance
        );
        expect(await toToken.balanceOf(DCAPairSwapHandler.address)).to.be.equal(
          initialToTokenBalance.add(boughtToToken)
        );
        expect(await toToken.balanceOf(DCAPairSwapHandler.address)).to.be.gt(
          initialToTokenBalance
        );
      });
      it('adds new rate per unit in correct swap and with correct rate', async () => {
        expect(await DCAPairSwapHandler.accumRatesPerUnit(swap, 0)).to.equal(0);
        expect(await DCAPairSwapHandler.accumRatesPerUnit(swap, 1)).to.equal(0);
        await DCAPairSwapHandler.swap();
        expect(await DCAPairSwapHandler.accumRatesPerUnit(swap, 0)).to.equal(
          uniswapRatePerUnit
        );
        expect(await DCAPairSwapHandler.accumRatesPerUnit(swap, 1)).to.equal(0);
      });
      it('deletes swap amount delta on current swap', async () => {
        expect(await DCAPairSwapHandler.swapAmountDelta(swap)).to.equal(
          swapAmountDelta
        );
        await DCAPairSwapHandler.swap();
        expect(await DCAPairSwapHandler.swapAmountDelta(swap)).to.equal(0);
      });
      it('updates performed swaps', async () => {
        expect(await DCAPairSwapHandler.performedSwaps()).to.equal(swap.sub(1));
        await DCAPairSwapHandler.swap();
        expect(await DCAPairSwapHandler.performedSwaps()).to.equal(swap);
      });
      it('emits event with correct information', async () => {
        await expect(DCAPairSwapHandler.swap())
          .to.emit(DCAPairSwapHandler, 'Swapped')
          .withArgs(
            swapAmountAccumulator.add(swapAmountDelta),
            uniswapRatePerUnit
              .mul(swapAmountAccumulator.add(swapAmountDelta))
              .div(magnitude)
              .add(1), // add(1) = big number adjust
            uniswapRatePerUnit
          );
      });
    });
  });

  describe('_uniswapSwap', () => {
    it('correctly swaps indicated value from token to token');
  });
});
