import { expect } from 'chai';
import { BigNumber, Contract, ContractFactory } from 'ethers';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { ethers } from 'hardhat';
import { behaviours, constants } from '../../utils';
import { given, then, when } from '../../utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import erc20, { TokenContract } from '../../utils/erc20';
import { readArgFromEvent } from '../../utils/event-utils';

describe('DCASwapper', () => {
  const ADDRESS_1 = '0x0000000000000000000000000000000000000001';
  const ADDRESS_2 = '0x0000000000000000000000000000000000000002';

  let owner: SignerWithAddress, swapperCaller: SignerWithAddress;
  let DCASwapperContract: ContractFactory, DCAFactoryContract: ContractFactory;
  let UniswapRouterContract: ContractFactory, UniswapQuoterContract: ContractFactory;
  let UniswapFactoryContract: ContractFactory;
  let DCASwapper: Contract, DCAFactory: Contract;
  let UniswapRouter: Contract, UniswapQuoter: Contract, UniswapFactory: Contract;

  before('Setup accounts and contracts', async () => {
    [owner, swapperCaller] = await ethers.getSigners();
    DCASwapperContract = await ethers.getContractFactory('contracts/mocks/DCASwapper/DCASwapper.sol:DCASwapperMock');
    DCAFactoryContract = await ethers.getContractFactory('contracts/mocks/DCASwapper/DCAFactoryMock.sol:DCAFactoryMock');
    UniswapRouterContract = await ethers.getContractFactory('contracts/mocks/DCASwapper/SwapRouterMock.sol:SwapRouterMock');
    UniswapQuoterContract = await ethers.getContractFactory('contracts/mocks/DCASwapper/QuoterMock.sol:QuoterMock');
    UniswapFactoryContract = await ethers.getContractFactory('contracts/mocks/DCASwapper/UniswapFactoryMock.sol:UniswapFactoryMock');
  });

  beforeEach('Deploy and configure', async () => {
    UniswapFactory = await UniswapFactoryContract.deploy();
    DCAFactory = await DCAFactoryContract.deploy();
    UniswapRouter = await UniswapRouterContract.deploy();
    UniswapQuoter = await UniswapQuoterContract.deploy(UniswapFactory.address);
    DCASwapper = await DCASwapperContract.deploy(owner.address, DCAFactory.address, UniswapRouter.address, UniswapQuoter.address);
  });

  describe('constructor', () => {
    when('factory is zero address', () => {
      then('tx is reverted with reason error', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: DCASwapperContract,
          args: [owner.address, constants.ZERO_ADDRESS, UniswapRouter.address, UniswapQuoter.address],
          message: 'ZeroAddress',
        });
      });
    });
    when('router is zero address', () => {
      then('tx is reverted with reason error', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: DCASwapperContract,
          args: [owner.address, DCAFactory.address, constants.ZERO_ADDRESS, UniswapQuoter.address],
          message: 'ZeroAddress',
        });
      });
    });
    when('quoter is zero address', () => {
      then('tx is reverted with reason error', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: DCASwapperContract,
          args: [owner.address, DCAFactory.address, UniswapRouter.address, constants.ZERO_ADDRESS],
          message: 'ZeroAddress',
        });
      });
    });
    when('all arguments are valid', () => {
      then('factory is set correctly', async () => {
        const factory = await DCASwapper.factory();
        expect(factory).to.equal(DCAFactory.address);
      });
      then('router is set correctly', async () => {
        const router = await DCASwapper.swapRouter();
        expect(router).to.equal(UniswapRouter.address);
      });
      then('quoter is set correctly', async () => {
        const quoter = await DCASwapper.quoter();
        expect(quoter).to.equal(UniswapQuoter.address);
      });
    });
  });

  describe('startWatchingPairs', () => {
    when('one of the pairs is not a DCA pair', () => {
      given(async () => {
        await DCAFactory.setAsPair(ADDRESS_1);
      });
      then('tx is reverted with reason', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCASwapper,
          func: 'startWatchingPairs',
          args: [[ADDRESS_1, ADDRESS_2]],
          message: 'InvalidPairAddress',
        });
        await behaviours.txShouldRevertWithMessage({
          contract: DCASwapper,
          func: 'startWatchingPairs',
          args: [[ADDRESS_2, ADDRESS_1]],
          message: 'InvalidPairAddress',
        });
      });
    });
    when('addresses are valid pairs', () => {
      let tx: TransactionResponse;

      given(async () => {
        await DCAFactory.setAsPair(ADDRESS_1);
        await DCAFactory.setAsPair(ADDRESS_2);
        tx = await DCASwapper.startWatchingPairs([ADDRESS_1, ADDRESS_2]);
      });

      then('pairs are added', async () => {
        expect(await DCASwapper.watchedPairs()).to.eql([ADDRESS_1, ADDRESS_2]);
      });

      then('event is emmitted', async () => {
        await expect(tx).to.emit(DCASwapper, 'WatchingNewPairs').withArgs([ADDRESS_1, ADDRESS_2]);
      });
    });
    behaviours.shouldBeExecutableOnlyByGovernor({
      contract: () => DCASwapper,
      funcAndSignature: 'startWatchingPairs(address[])',
      params: [[ADDRESS_1]],
      governor: () => owner,
    });
  });
  describe('stopWatchingPairs', () => {
    given(async () => {
      await DCAFactory.setAsPair(ADDRESS_1);
      await DCASwapper.startWatchingPairs([ADDRESS_1]);
    });
    when('address being watch is removed', () => {
      let tx: TransactionResponse;

      given(async () => {
        tx = await DCASwapper.stopWatchingPairs([ADDRESS_1]);
      });

      then('event is emitted', async () => {
        await expect(tx).to.emit(DCASwapper, 'StoppedWatchingPairs').withArgs([ADDRESS_1]);
      });
      then('pair is no longer watched', async () => {
        expect(await DCASwapper.watchedPairs()).to.be.empty;
      });
    });
    behaviours.shouldBeExecutableOnlyByGovernor({
      contract: () => DCASwapper,
      funcAndSignature: 'stopWatchingPairs(address[])',
      params: [[ADDRESS_1]],
      governor: () => owner,
    });
  });
  describe('DCAPairSwapCall', () => {
    let tokenA: TokenContract, tokenB: TokenContract;
    let rewardAmount: BigNumber;
    let amountToProvide: BigNumber;

    given(async () => {
      tokenA = await erc20.deploy({
        name: 'tokenA',
        symbol: 'TKNA',
      });
      tokenB = await erc20.deploy({
        name: 'tokenB',
        symbol: 'TKNB',
      });
      rewardAmount = tokenA.asUnits(100);
      amountToProvide = tokenB.asUnits(100);

      // Send reward to swapper
      await tokenA.mint(DCASwapper.address, rewardAmount);
    });

    when('callback is called but there is no need to provide tokens', () => {
      given(async () => {
        await DCASwapper.connect(swapperCaller).DCAPairSwapCall(
          constants.ZERO_ADDRESS, // Not used
          tokenA.address,
          tokenB.address,
          0, // Not used
          0, // Not used
          true,
          0,
          0,
          ethers.utils.randomBytes(5)
        );
      });

      then('the router is not called', async () => {
        const { fee } = await UniswapRouter.lastCall();
        expect(fee).to.equal(0);
      });

      then('nothing is sent back to the caller', async () => {
        const balance = await tokenA.balanceOf(swapperCaller.address);
        expect(balance).to.equal(constants.ZERO);
      });
    });

    when('callback is called and all reward is used', () => {
      given(async () => {
        // Prepare swapper to that it says it used the whole reward
        await UniswapRouter.setAmountIn(rewardAmount);

        await DCASwapper.connect(swapperCaller).DCAPairSwapCall(
          constants.ZERO_ADDRESS, // Not used
          tokenA.address,
          tokenB.address,
          0, // Not used
          0, // Not used
          true,
          rewardAmount,
          amountToProvide,
          ethers.utils.defaultAbiCoder.encode(['uint24'], [10000])
        );
      });

      then('the router is called', async () => {
        const { tokenIn, tokenOut, fee, recipient, deadline, amountOut, amountInMaximum, sqrtPriceLimitX96 } = await UniswapRouter.lastCall();
        expect(tokenIn).to.equal(tokenA.address);
        expect(tokenOut).to.equal(tokenB.address);
        expect(fee).to.equal(10000);
        expect(recipient).to.equal(swapperCaller.address);
        expect(deadline.gt(0)).to.be.true;
        expect(amountOut).to.equal(amountToProvide);
        expect(amountInMaximum).to.equal(rewardAmount);
        expect(sqrtPriceLimitX96).to.equal(constants.ZERO);
      });

      then('allowance is not modified', async () => {
        const allowance = await tokenA.allowance(DCASwapper.address, UniswapRouter.address);
        expect(allowance).to.equal(rewardAmount);
      });

      then('nothing is sent back to the caller', async () => {
        const balance = await tokenA.balanceOf(swapperCaller.address);
        expect(balance).to.equal(constants.ZERO);
      });
    });

    when(`callback is called and router doesn't use all reward`, () => {
      given(async () => {
        // Prepare swapper to that it says it didn't use the whole reward
        await UniswapRouter.setAmountIn(rewardAmount.sub(1));

        await DCASwapper.connect(swapperCaller).DCAPairSwapCall(
          constants.ZERO_ADDRESS, // Not used
          tokenA.address,
          tokenB.address,
          0, // Not used
          0, // Not used
          true,
          rewardAmount,
          amountToProvide,
          ethers.utils.defaultAbiCoder.encode(['uint24'], [500])
        );
      });

      then('the router is called', async () => {
        const { tokenIn, tokenOut, fee, recipient, deadline, amountOut, amountInMaximum, sqrtPriceLimitX96 } = await UniswapRouter.lastCall();
        expect(tokenIn).to.equal(tokenA.address);
        expect(tokenOut).to.equal(tokenB.address);
        expect(fee).to.equal(500);
        expect(recipient).to.equal(swapperCaller.address);
        expect(deadline.gt(0)).to.be.true;
        expect(amountOut).to.equal(amountToProvide);
        expect(amountInMaximum).to.equal(rewardAmount);
        expect(sqrtPriceLimitX96).to.equal(constants.ZERO);
      });

      then('allowance is set to zero', async () => {
        const allowance = await tokenA.allowance(DCASwapper.address, UniswapRouter.address);
        expect(allowance).to.equal(constants.ZERO);
      });

      then('difference is sent back to the caller', async () => {
        const balance = await tokenA.balanceOf(swapperCaller.address);
        expect(balance).to.equal(BigNumber.from(1));
      });
    });
  });
  describe('_bestFeeTierForSwap', () => {
    const REWARD_AMOUNT = BigNumber.from(1000);
    const AMOUNT_TO_PROVIDE = BigNumber.from(2000);
    let DCAPair: Contract;

    given(async () => {
      const DCAPairMockContract = await ethers.getContractFactory('contracts/mocks/DCASwapper/DCAPairMock.sol:DCAPairMock');
      DCAPair = await DCAPairMockContract.deploy();
    });

    when('amount of swaps is zero', () => {
      let feeTier: number;

      given(async () => {
        await DCAPair.setNextSwapInfo(0, ADDRESS_1, ADDRESS_2, AMOUNT_TO_PROVIDE, REWARD_AMOUNT);
        await UniswapFactory.supportPair(ADDRESS_1, ADDRESS_2, 3000);
        feeTier = await DCASwapper.callStatic.bestFeeTierForSwap(DCAPair.address);
      });

      then('returned fee tier is 0', async () => {
        expect(feeTier).to.equal(0);
      });
    });

    when('there are some swaps, but no amount to provide', () => {
      let feeTier: BigNumber;

      given(async () => {
        await DCAPair.setNextSwapInfo(1, ADDRESS_1, ADDRESS_2, constants.ZERO, REWARD_AMOUNT);
        feeTier = await DCASwapper.callStatic.bestFeeTierForSwap(DCAPair.address);
      });

      then('returned fee tier is max(uint24)', async () => {
        expect(feeTier).to.equal(BigNumber.from(2).pow(24).sub(1));
      });
    });

    shouldBeSwappedTest({
      title: 'quoter needs more than reward',
      rewardAmount: REWARD_AMOUNT,
      amountNeededByQuoter: REWARD_AMOUNT.add(1),
      shouldBeSwapped: false,
    });

    shouldBeSwappedTest({
      title: 'quoter needs exactly reward',
      rewardAmount: REWARD_AMOUNT,
      amountNeededByQuoter: REWARD_AMOUNT,
      shouldBeSwapped: true,
    });

    shouldBeSwappedTest({
      title: 'quoter needs less than reward',
      rewardAmount: REWARD_AMOUNT,
      amountNeededByQuoter: REWARD_AMOUNT.sub(1),
      shouldBeSwapped: true,
    });

    function shouldBeSwappedTest({
      title,
      rewardAmount,
      amountNeededByQuoter,
      shouldBeSwapped,
    }: {
      title: string;
      rewardAmount: BigNumber;
      amountNeededByQuoter: BigNumber;
      shouldBeSwapped: boolean;
    }) {
      when(title, () => {
        const FEE_TIER = 3000;
        let returnedFeeTier: number;

        given(async () => {
          await DCAPair.setNextSwapInfo(1, ADDRESS_1, ADDRESS_2, AMOUNT_TO_PROVIDE, rewardAmount);
          await UniswapFactory.supportPair(ADDRESS_1, ADDRESS_2, FEE_TIER);
          await UniswapQuoter.setAmountNecessary(FEE_TIER, amountNeededByQuoter);
          returnedFeeTier = await DCASwapper.callStatic.bestFeeTierForSwap(DCAPair.address);
        });

        then('bestFeeTierForSwap returns as expected', async () => {
          if (shouldBeSwapped) {
            expect(returnedFeeTier).to.be.equal(FEE_TIER);
          } else {
            expect(returnedFeeTier).to.equal(0);
          }
        });
      });
    }
    when(`no pools exist for fee tier`, () => {
      let feeTier: number;

      given(async () => {
        await DCAPair.setNextSwapInfo(1, ADDRESS_1, ADDRESS_2, AMOUNT_TO_PROVIDE, REWARD_AMOUNT);
        feeTier = await DCASwapper.callStatic.bestFeeTierForSwap(DCAPair.address);
      });

      then('returned fee tier is 0', async () => {
        expect(feeTier).to.equal(0);
      });
    });

    when('many fee tiers are available', () => {
      const FEE_TIER_1 = 3000;
      const FEE_TIER_2 = 10000;

      let feeTier: BigNumber;
      given(async () => {
        await DCAPair.setNextSwapInfo(1, ADDRESS_1, ADDRESS_2, AMOUNT_TO_PROVIDE, REWARD_AMOUNT);
        await UniswapFactory.supportPair(ADDRESS_1, ADDRESS_2, FEE_TIER_1);
        await UniswapFactory.supportPair(ADDRESS_1, ADDRESS_2, FEE_TIER_2);
        await UniswapQuoter.setAmountNecessary(FEE_TIER_1, REWARD_AMOUNT.sub(1));
        await UniswapQuoter.setAmountNecessary(FEE_TIER_2, REWARD_AMOUNT.sub(2));

        feeTier = await DCASwapper.callStatic.bestFeeTierForSwap(DCAPair.address);
      });
      then('the one that requires less input is returned', () => {
        expect(feeTier).to.equal(FEE_TIER_2);
      });
    });
  });

  describe('getPairsToSwap', () => {
    const ADDRESS_3 = '0x0000000000000000000000000000000000000003';

    given(async () => {
      await DCAFactory.setAsPair(ADDRESS_1);
      await DCAFactory.setAsPair(ADDRESS_2);
      await DCAFactory.setAsPair(ADDRESS_3);
    });

    when('there are no pairs being watched', () => {
      then('empty list is returned', async () => {
        const pairsToSwap = await DCASwapper.callStatic.getPairsToSwap();
        expect(pairsToSwap).to.be.empty;
      });
    });

    when('pairs being watched should not be swaped', () => {
      given(async () => {
        await DCASwapper.startWatchingPairs([ADDRESS_1, ADDRESS_2]);
        await DCASwapper.setPairsToSwap([], []);
      });

      then('empty list is returned', async () => {
        const pairsToSwap = await DCASwapper.callStatic.getPairsToSwap();
        expect(pairsToSwap).to.be.empty;
      });
    });

    when('some of the pairs being watched should be swapped', () => {
      given(async () => {
        await DCASwapper.startWatchingPairs([ADDRESS_1, ADDRESS_2, ADDRESS_3]);
        await DCASwapper.setPairsToSwap([ADDRESS_1, ADDRESS_3], [3000, 10000]);
      });

      then('then they are returned', async () => {
        const pairsToSwap: { pair: string; bestFeeTier: number }[] = await DCASwapper.callStatic.getPairsToSwap();
        expect(pairsToSwap.map(({ pair }) => pair)).to.eql([ADDRESS_3, ADDRESS_1]);
        expect(pairsToSwap.map(({ bestFeeTier }) => bestFeeTier)).to.eql([10000, 3000]);
      });
    });
  });

  describe('swapPairs', () => {
    when('empty list of swaps is passed', () => {
      then('tx is reverted', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCASwapper,
          func: 'swapPairs',
          args: [[], []],
          message: 'ZeroPairsToSwap',
        });
      });
    });

    when('gas limit is enough', () => {
      let pairsToSwap: [string, number][];
      let DCAPair1: Contract, DCAPair2: Contract, DCAPair3: Contract;
      let tx: TransactionResponse;

      given(async () => {
        const DCAPairMockContract = await ethers.getContractFactory('contracts/mocks/DCASwapper/DCAPairMock.sol:DCAPairMock');
        DCAPair1 = await DCAPairMockContract.deploy();
        DCAPair2 = await DCAPairMockContract.deploy();
        DCAPair3 = await DCAPairMockContract.deploy();

        pairsToSwap = [
          [DCAPair1.address, 500],
          [DCAPair2.address, 3000],
          [DCAPair3.address, 10000],
        ];
        tx = await DCASwapper.swapPairs(pairsToSwap);
      });

      then('all pairs are swapped', async () => {
        expect(await DCAPair1.swappedWithFee(500)).to.be.true;
        expect(await DCAPair2.swappedWithFee(3000)).to.be.true;
        expect(await DCAPair3.swappedWithFee(10000)).to.be.true;
      });

      then('event is emitted', async () => {
        const pairs = await readArgFromEvent(tx, 'Swapped', '_pairsToSwap');
        const amount = await readArgFromEvent(tx, 'Swapped', '_amountSwapped');
        expect(pairs).to.eql(pairsToSwap);
        expect(amount).to.equal(3);
      });
    });

    when('gas limit is not enough', () => {
      let pairsToSwap: [string, number][];
      let DCAPair1: Contract, DCAPair2: Contract, DCAPair3: Contract;
      let tx: TransactionResponse;

      given(async () => {
        const DCAPairMockContract = await ethers.getContractFactory('contracts/mocks/DCASwapper/DCAPairMock.sol:DCAPairMock');
        DCAPair1 = await DCAPairMockContract.deploy();
        DCAPair2 = await DCAPairMockContract.deploy();
        DCAPair3 = await DCAPairMockContract.deploy();

        await DCAPair1.setGasToConsumeInSwap(100000);
        await DCAPair2.setGasToConsumeInSwap(200000);

        pairsToSwap = [
          [DCAPair1.address, 10000],
          [DCAPair2.address, 500],
          [DCAPair3.address, 3000],
        ];
        tx = await DCASwapper.swapPairs(pairsToSwap, { gasLimit: 500000 });
      });

      then('some pairs are not swapped', async () => {
        expect(await DCAPair1.swappedWithFee(10000)).to.be.true;
        expect(await DCAPair2.swappedWithFee(500)).to.be.true;
        expect(await DCAPair3.swapped()).to.be.false;
      });

      then('event is still emitted', async () => {
        const pairs = await readArgFromEvent(tx, 'Swapped', '_pairsToSwap');
        const amount = await readArgFromEvent(tx, 'Swapped', '_amountSwapped');
        expect(pairs).to.eql(pairsToSwap);
        expect(amount).to.equal(2);
      });
    });
  });
});
