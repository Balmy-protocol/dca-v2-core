import moment from 'moment';
import { expect } from 'chai';
import { BigNumber, utils } from 'ethers';
import { ethers } from 'hardhat';
import { DCAHub, DCAHub__factory, IUniswapV3OracleAggregator } from '@typechained';
import { abi as IUniswapV3OracleAggregatorABI } from '@artifacts/contracts/interfaces/ITimeWeightedOracle.sol/IUniswapV3OracleAggregator.json';
import { constants, erc20, evm, wallet } from '@test-utils';
import { contract, given, then, when } from '@test-utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { TokenContract } from '@test-utils/erc20';
import { FakeContract, smock } from '@defi-wonderland/smock';
import { buildGetNextSwapInfoInput, buildSwapInput } from 'js-lib/swap-utils';

contract('DCAHub', () => {
  describe('Precision breaker', () => {
    const SWAP_INTERVAL_1_HOUR = moment.duration(1, 'hour').as('seconds');

    let governor: SignerWithAddress;
    let alice: SignerWithAddress, john: SignerWithAddress, swapper1: SignerWithAddress;
    let tokenA: TokenContract, tokenB: TokenContract;
    let DCAHubFactory: DCAHub__factory, DCAHub: DCAHub;
    let timeWeightedOracle: FakeContract<IUniswapV3OracleAggregator>;

    // Global variables
    const swapFee: number = 0.6;

    before('Setup accounts and contracts', async () => {
      [governor, alice, john, swapper1] = await ethers.getSigners();
      DCAHubFactory = await ethers.getContractFactory('contracts/DCAHub/DCAHub.sol:DCAHub');
    });

    beforeEach('Deploy and configure', async () => {
      await evm.reset();
      tokenA = await erc20.deploy({
        name: 'WBTC',
        symbol: 'WBTC',
        decimals: 8,
      });
      tokenB = await erc20.deploy({
        name: 'DAI',
        symbol: 'DAI',
        decimals: 18,
      });
      timeWeightedOracle = await smock.fake(IUniswapV3OracleAggregatorABI);
      DCAHub = await DCAHubFactory.deploy(tokenA.address, tokenB.address, governor.address, governor.address, timeWeightedOracle.address);
      await DCAHub.addSwapIntervalsToAllowedList([SWAP_INTERVAL_1_HOUR], ['1 hour']);
      await setInitialBalance(john, { tokenA: 0, tokenB: 1000 });
      await setInitialBalance(alice, { tokenA: 0, tokenB: 10000 });
      await setInitialBalance(swapper1, { tokenA: 2000, tokenB: 2000 });
    });

    when('all swaps are done', () => {
      given(async () => {
        await tokenB.connect(alice).approve(DCAHub.address, constants.MAX_UINT_256);
        await DCAHub.connect(alice).deposit(alice.address, tokenB.address, BigNumber.from('89509558490300730500'), 3, SWAP_INTERVAL_1_HOUR);

        await tokenB.connect(john).approve(DCAHub.address, constants.MAX_UINT_256);
        await DCAHub.connect(john).deposit(john.address, tokenB.address, utils.parseEther('200'), 5, SWAP_INTERVAL_1_HOUR);

        await evm.advanceTimeAndBlock(SWAP_INTERVAL_1_HOUR);
        await timeWeightedOracle.quote.returns(BigNumber.from('2246'));
        await swap({ swapper: swapper1 });
        await evm.advanceTimeAndBlock(SWAP_INTERVAL_1_HOUR);
        await timeWeightedOracle.quote.returns(BigNumber.from('2209'));
        await swap({ swapper: swapper1 });
        await evm.advanceTimeAndBlock(SWAP_INTERVAL_1_HOUR);
        await timeWeightedOracle.quote.returns(BigNumber.from('2190'));
        await swap({ swapper: swapper1 });

        await DCAHub.connect(alice).withdrawSwapped(1, wallet.generateRandomAddress());

        await evm.advanceTimeAndBlock(SWAP_INTERVAL_1_HOUR);
        await timeWeightedOracle.quote.returns(BigNumber.from('2175'));
        await swap({ swapper: swapper1 });
        await evm.advanceTimeAndBlock(SWAP_INTERVAL_1_HOUR);
        await timeWeightedOracle.quote.returns(BigNumber.from('2216'));
        await swap({ swapper: swapper1 });
      });

      then("doesnt match the balance of contract with user's swapped amount", async () => {
        await expect(DCAHub.connect(john).withdrawSwapped(2, wallet.generateRandomAddress())).to.be.reverted;
      });
    });

    async function swap({ swapper }: { swapper: SignerWithAddress }) {
      const { amountToBeProvidedBySwapper, tokenToBeProvidedBySwapper } = await getAmountToBeProvided();
      await tokenToBeProvidedBySwapper.connect(swapper).transfer(DCAHub.address, amountToBeProvidedBySwapper);
      const { tokens, pairIndexes } = buildSwapInput([{ tokenA: tokenA.address, tokenB: tokenB.address }], []);
      // @ts-ignore
      await DCAHub.connect(swapper)['swap(address[],(uint8,uint8)[])'](tokens, pairIndexes);
    }

    async function getAmountToBeProvided(): Promise<{ tokenToBeProvidedBySwapper: TokenContract; amountToBeProvidedBySwapper: BigNumber }> {
      const { tokens, pairIndexes } = buildGetNextSwapInfoInput([{ tokenA: tokenA.address, tokenB: tokenB.address }], []);
      const nextSwapInfo = await DCAHub.getNextSwapInfo(tokens, pairIndexes);
      const [token0, token1] = nextSwapInfo.tokens;
      let amountToBeProvidedBySwapper: BigNumber;
      let tokenToBeProvidedBySwapper: string;
      if (token0.toProvide.gt(token1.toProvide)) {
        amountToBeProvidedBySwapper = token0.toProvide;
        tokenToBeProvidedBySwapper = token0.token;
      } else {
        amountToBeProvidedBySwapper = token1.toProvide;
        tokenToBeProvidedBySwapper = token1.token;
      }
      return { amountToBeProvidedBySwapper, tokenToBeProvidedBySwapper: tokenToBeProvidedBySwapper === tokenA.address ? tokenA : tokenB };
    }

    async function setInitialBalance(
      hasAddress: HasAddress,
      { tokenA: amountTokenA, tokenB: amountTokenB }: { tokenA: number; tokenB: number }
    ) {
      await tokenA.mint(hasAddress.address, tokenA.asUnits(amountTokenA));
      await tokenB.mint(hasAddress.address, tokenB.asUnits(amountTokenB));
    }

    type HasAddress = {
      readonly address: string;
    };
  });
});
