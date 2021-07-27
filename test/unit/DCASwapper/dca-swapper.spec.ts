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
  let DCASwapperContract: ContractFactory;
  let UniswapRouterContract: ContractFactory, UniswapQuoterContract: ContractFactory;
  let UniswapFactoryContract: ContractFactory;
  let DCASwapper: Contract;
  let UniswapRouter: Contract, UniswapQuoter: Contract, UniswapFactory: Contract;

  before('Setup accounts and contracts', async () => {
    [owner, swapperCaller] = await ethers.getSigners();
    DCASwapperContract = await ethers.getContractFactory('contracts/mocks/DCASwapper/DCASwapper.sol:DCASwapperMock');
    UniswapRouterContract = await ethers.getContractFactory('contracts/mocks/DCASwapper/SwapRouterMock.sol:SwapRouterMock');
    UniswapQuoterContract = await ethers.getContractFactory('contracts/mocks/DCASwapper/QuoterMock.sol:QuoterMock');
    UniswapFactoryContract = await ethers.getContractFactory('contracts/mocks/DCASwapper/UniswapFactoryMock.sol:UniswapFactoryMock');
  });

  beforeEach('Deploy and configure', async () => {
    UniswapFactory = await UniswapFactoryContract.deploy();
    UniswapRouter = await UniswapRouterContract.deploy();
    UniswapQuoter = await UniswapQuoterContract.deploy(UniswapFactory.address);
    DCASwapper = await DCASwapperContract.deploy(owner.address, UniswapRouter.address, UniswapQuoter.address);
  });

  describe('constructor', () => {
    when('router is zero address', () => {
      then('tx is reverted with reason error', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: DCASwapperContract,
          args: [owner.address, constants.ZERO_ADDRESS, UniswapQuoter.address],
          message: 'ZeroAddress',
        });
      });
    });
    when('quoter is zero address', () => {
      then('tx is reverted with reason error', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: DCASwapperContract,
          args: [owner.address, UniswapRouter.address, constants.ZERO_ADDRESS],
          message: 'ZeroAddress',
        });
      });
    });
    when('all arguments are valid', () => {
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
  describe('bestFeeTierForSwap', () => {
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

    when('quoter reverts with one of the fee tiers', () => {
      const FEE_TIER_1 = 3000;
      const FEE_TIER_2 = 10000;

      let feeTier: BigNumber;
      given(async () => {
        await DCAPair.setNextSwapInfo(1, ADDRESS_1, ADDRESS_2, AMOUNT_TO_PROVIDE, REWARD_AMOUNT);
        await UniswapFactory.supportPair(ADDRESS_1, ADDRESS_2, FEE_TIER_1);
        await UniswapFactory.supportPair(ADDRESS_1, ADDRESS_2, FEE_TIER_2);
        await UniswapQuoter.revertOn(FEE_TIER_1);
        await UniswapQuoter.setAmountNecessary(FEE_TIER_2, REWARD_AMOUNT);

        feeTier = await DCASwapper.callStatic.bestFeeTierForSwap(DCAPair.address);
      });

      then('another fee is used without any problems', async () => {
        expect(feeTier).to.equal(FEE_TIER_2);
      });
    });

    when('quoter reverts with all fee tiers', () => {
      const FEE_TIER_1 = 3000;
      const FEE_TIER_2 = 10000;

      let feeTier: BigNumber;
      given(async () => {
        await DCAPair.setNextSwapInfo(1, ADDRESS_1, ADDRESS_2, AMOUNT_TO_PROVIDE, REWARD_AMOUNT);
        await UniswapFactory.supportPair(ADDRESS_1, ADDRESS_2, FEE_TIER_1);
        await UniswapFactory.supportPair(ADDRESS_1, ADDRESS_2, FEE_TIER_2);
        await UniswapQuoter.revertOn(FEE_TIER_1);
        await UniswapQuoter.revertOn(FEE_TIER_2);

        feeTier = await DCASwapper.callStatic.bestFeeTierForSwap(DCAPair.address);
      });

      then('returned fee tier is 0', async () => {
        expect(feeTier).to.equal(0);
      });
    });
  });

  describe.skip('getPairsToSwap', () => {
    const ADDRESS_3 = '0x0000000000000000000000000000000000000003';

    given(async () => {
      // await DCAFactory.setAsPair(ADDRESS_1);
      // await DCAFactory.setAsPair(ADDRESS_2);
      // await DCAFactory.setAsPair(ADDRESS_3);
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
          args: [[]],
          message: 'ZeroPairsToSwap',
        });
      });
    });
    when('contract is paused', () => {
      given(async () => {
        await DCASwapper.pause();
      });
      then('attempts to swap revert', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCASwapper,
          func: 'swapPairs',
          args: [[]],
          message: 'Pausable: paused',
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
  describe('sendDust', () => {
    let token: TokenContract;
    given(async () => {
      token = await erc20.deploy({
        name: 'tokenA',
        symbol: 'TKNA',
      });
      await token.mint(DCASwapper.address, 20000);
    });
    behaviours.shouldBeExecutableOnlyByGovernor({
      contract: () => DCASwapper,
      funcAndSignature: 'sendDust(address,address,uint256)',
      params: () => [owner.address, token.address, 20000],
      governor: () => owner,
    });
  });
  describe('pause', () => {
    when('contract is paused', () => {
      let tx: TransactionResponse;

      given(async () => {
        tx = await DCASwapper.pause();
      });

      then('getter says so', async () => {
        expect(await DCASwapper.paused()).to.be.true;
      });

      then('attempts to pause it again will revert', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCASwapper,
          func: 'pause',
          args: [],
          message: 'Pausable: paused',
        });
      });

      then('event is emitted', async () => {
        await expect(tx).to.emit(DCASwapper, 'Paused');
      });
    });

    behaviours.shouldBeExecutableOnlyByGovernor({
      contract: () => DCASwapper,
      funcAndSignature: 'pause()',
      params: [],
      governor: () => owner,
    });
  });

  describe('unpause', () => {
    given(async () => {
      await DCASwapper.pause();
    });

    when('contract is unpaused', () => {
      let tx: TransactionResponse;

      given(async () => {
        tx = await DCASwapper.unpause();
      });

      then('getter says so', async () => {
        expect(await DCASwapper.paused()).to.be.false;
      });

      then('attempts to unpause it again will revert', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCASwapper,
          func: 'unpause',
          args: [],
          message: 'Pausable: not paused',
        });
      });

      then('event is emitted', async () => {
        await expect(tx).to.emit(DCASwapper, 'Unpaused');
      });
    });

    behaviours.shouldBeExecutableOnlyByGovernor({
      contract: () => DCASwapper,
      funcAndSignature: 'unpause()',
      params: [],
      governor: () => owner,
    });
  });
});
