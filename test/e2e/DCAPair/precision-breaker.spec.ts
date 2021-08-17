import moment from 'moment';
import { expect } from 'chai';
import { BigNumber, Contract, ContractFactory, utils } from 'ethers';
import { ethers } from 'hardhat';
import { DCAGlobalParameters, DCAGlobalParameters__factory, DCAPair, DCAPair__factory, IUniswapV3OracleAggregator } from '@typechained';
import { abi as IUniswapV3OracleAggregatorABI } from '@artifacts/contracts/interfaces/ITimeWeightedOracle.sol/IUniswapV3OracleAggregator.json';
import { constants, erc20, evm } from '@test-utils';
import { contract, given, then, when } from '@test-utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { TokenContract } from '@test-utils/erc20';
import { FakeContract, smock } from '@defi-wonderland/smock';

contract('DCAPair', () => {
  describe('Precision breaker', () => {
    const SWAP_INTERVAL_1_HOUR = moment.duration(1, 'hour').as('seconds');

    let governor: SignerWithAddress, feeRecipient: SignerWithAddress;
    let alice: SignerWithAddress, john: SignerWithAddress, swapper1: SignerWithAddress;
    let tokenA: TokenContract, tokenB: TokenContract;
    let DCAPairFactory: DCAPair__factory, DCAPair: DCAPair;
    let DCAGlobalParametersFactory: DCAGlobalParameters__factory, DCAGlobalParameters: DCAGlobalParameters;
    let timeWeightedOracle: FakeContract<IUniswapV3OracleAggregator>;

    // Global variables
    const swapFee: number = 0.6;

    before('Setup accounts and contracts', async () => {
      [governor, feeRecipient, alice, john, swapper1] = await ethers.getSigners();
      DCAGlobalParametersFactory = await ethers.getContractFactory('contracts/DCAGlobalParameters/DCAGlobalParameters.sol:DCAGlobalParameters');
      DCAPairFactory = await ethers.getContractFactory('contracts/DCAPair/DCAPair.sol:DCAPair');
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
      DCAGlobalParameters = await DCAGlobalParametersFactory.deploy(
        governor.address,
        governor.address,
        feeRecipient.address,
        constants.NOT_ZERO_ADDRESS,
        timeWeightedOracle.address
      );
      DCAPair = await DCAPairFactory.deploy(DCAGlobalParameters.address, tokenA.address, tokenB.address);
      await DCAGlobalParameters.setSwapFee(swapFee * 10000);
      await DCAGlobalParameters.addSwapIntervalsToAllowedList([SWAP_INTERVAL_1_HOUR], ['1 hour']);
      await setInitialBalance(john, { tokenA: 0, tokenB: 1000 });
      await setInitialBalance(alice, { tokenA: 0, tokenB: 10000 });
      await setInitialBalance(swapper1, { tokenA: 2000, tokenB: 2000 });
    });

    when('all swaps are done', () => {
      given(async () => {
        await tokenB.connect(alice).approve(DCAPair.address, constants.MAX_UINT_256);
        await DCAPair.connect(alice).deposit(tokenB.address, BigNumber.from('89509558490300730500'), 3, SWAP_INTERVAL_1_HOUR);

        await tokenB.connect(john).approve(DCAPair.address, constants.MAX_UINT_256);
        await DCAPair.connect(john).deposit(tokenB.address, utils.parseEther('200'), 5, SWAP_INTERVAL_1_HOUR);

        await evm.advanceTimeAndBlock(SWAP_INTERVAL_1_HOUR);
        await timeWeightedOracle.quote.returns(BigNumber.from('2246'));
        await swap({ swapper: swapper1 });
        await evm.advanceTimeAndBlock(SWAP_INTERVAL_1_HOUR);
        await timeWeightedOracle.quote.returns(BigNumber.from('2209'));
        await swap({ swapper: swapper1 });
        await evm.advanceTimeAndBlock(SWAP_INTERVAL_1_HOUR);
        await timeWeightedOracle.quote.returns(BigNumber.from('2190'));
        await swap({ swapper: swapper1 });

        await DCAPair.connect(alice).withdrawSwapped(1);

        await evm.advanceTimeAndBlock(SWAP_INTERVAL_1_HOUR);
        await timeWeightedOracle.quote.returns(BigNumber.from('2175'));
        await swap({ swapper: swapper1 });
        await evm.advanceTimeAndBlock(SWAP_INTERVAL_1_HOUR);
        await timeWeightedOracle.quote.returns(BigNumber.from('2216'));
        await swap({ swapper: swapper1 });
      });

      then("doesnt match the balance of contract with user's swapped amount", async () => {
        await expect(DCAPair.connect(john).withdrawSwapped(2)).to.be.reverted;
      });
    });

    async function swap({ swapper }: { swapper: SignerWithAddress }) {
      const nextSwapInfo = await getNextSwapInfo();
      const tokenToProvide = nextSwapInfo.tokenToBeProvidedBySwapper === tokenA.address ? tokenA : tokenB;
      await tokenToProvide.connect(swapper).transfer(DCAPair.address, nextSwapInfo.amountToBeProvidedBySwapper);
      await DCAPair.connect(swapper)['swap()']();
    }

    async function getNextSwapInfo(): Promise<NextSwapInformation> {
      const nextSwapInfo: NextSwapInformation & { amountOfSwaps: number } = await DCAPair.getNextSwapInfo();
      return {
        ...nextSwapInfo,
        // Remove zeroed positions in array
        swapsToPerform: nextSwapInfo.swapsToPerform.slice(0, nextSwapInfo.amountOfSwaps),
      };
    }
    async function setInitialBalance(
      hasAddress: HasAddress,
      { tokenA: amountTokenA, tokenB: amountTokenB }: { tokenA: number; tokenB: number }
    ) {
      await tokenA.mint(hasAddress.address, tokenA.asUnits(amountTokenA));
      await tokenB.mint(hasAddress.address, tokenB.asUnits(amountTokenB));
    }

    type SwapInformation = {
      interval: number;
      swapToPerform: number;
      amountToSwapTokenA: BigNumber;
      amountToSwapTokenB: BigNumber;
    };

    type NextSwapInformation = {
      swapsToPerform: SwapInformation[];
      availableToBorrowTokenA: BigNumber;
      availableToBorrowTokenB: BigNumber;
      ratePerUnitBToA: BigNumber;
      ratePerUnitAToB: BigNumber;
      platformFeeTokenA: BigNumber;
      platformFeeTokenB: BigNumber;
      amountToBeProvidedBySwapper: BigNumber;
      amountToRewardSwapperWith: BigNumber;
      tokenToBeProvidedBySwapper: string;
      tokenToRewardSwapperWith: string;
    };

    type HasAddress = {
      readonly address: string;
    };
  });
});
