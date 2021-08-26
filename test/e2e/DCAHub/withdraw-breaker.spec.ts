import moment from 'moment';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';
import { DCAGlobalParameters, DCAGlobalParameters__factory, DCAHub, DCAHub__factory, IUniswapV3OracleAggregator } from '@typechained';
import { abi as IUniswapV3OracleAggregatorABI } from '@artifacts/contracts/interfaces/ITimeWeightedOracle.sol/IUniswapV3OracleAggregator.json';
import { constants, erc20, evm } from '@test-utils';
import { contract, given, then, when } from '@test-utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { TokenContract } from '@test-utils/erc20';
import { FakeContract, smock } from '@defi-wonderland/smock';

contract('DCAHub', () => {
  describe('Withdraw breaker', () => {
    const SWAP_INTERVAL_1_HOUR = moment.duration(1, 'hour').as('seconds');

    let governor: SignerWithAddress, feeRecipient: SignerWithAddress;
    let alice: SignerWithAddress, john: SignerWithAddress, swapper: SignerWithAddress;
    let tokenA: TokenContract, tokenB: TokenContract;
    let DCAHubFactory: DCAHub__factory, DCAHub: DCAHub;
    let DCAGlobalParametersFactory: DCAGlobalParameters__factory, DCAGlobalParameters: DCAGlobalParameters;
    let timeWeightedOracle: FakeContract<IUniswapV3OracleAggregator>;

    before('Setup accounts and contracts', async () => {
      [governor, feeRecipient, alice, john, swapper] = await ethers.getSigners();
      DCAGlobalParametersFactory = await ethers.getContractFactory('contracts/DCAGlobalParameters/DCAGlobalParameters.sol:DCAGlobalParameters');
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
      DCAGlobalParameters = await DCAGlobalParametersFactory.deploy(
        governor.address,
        governor.address,
        feeRecipient.address,
        constants.NOT_ZERO_ADDRESS,
        timeWeightedOracle.address
      );
      DCAHub = await DCAHubFactory.deploy(DCAGlobalParameters.address, tokenA.address, tokenB.address);
      await DCAGlobalParameters.addSwapIntervalsToAllowedList([SWAP_INTERVAL_1_HOUR], ['1 hour']);
      await setInitialBalance(alice, { tokenA: 0, tokenB: 200 });
      await setInitialBalance(john, { tokenA: 0, tokenB: 1000 });
      await setInitialBalance(swapper, { tokenA: 2000, tokenB: 2000 });
      await timeWeightedOracle.quote.returns(BigNumber.from('2246'));
    });

    when('when a withdraw is executed after position is finished', () => {
      given(async () => {
        await tokenB.connect(alice).approve(DCAHub.address, constants.MAX_UINT_256);
        await DCAHub.connect(alice).deposit(tokenB.address, tokenB.asUnits(200), 1, SWAP_INTERVAL_1_HOUR);

        await tokenB.connect(john).approve(DCAHub.address, constants.MAX_UINT_256);
        await DCAHub.connect(john).deposit(tokenB.address, tokenB.asUnits(200), 5, SWAP_INTERVAL_1_HOUR);

        await swap({ swapper: swapper });
        await evm.advanceTimeAndBlock(SWAP_INTERVAL_1_HOUR);
        await swap({ swapper: swapper });

        await DCAHub.connect(alice).withdrawSwapped(1, alice.address);
      });

      then('the position can still be queried', async () => {
        const { swapped } = await DCAHub.userPosition(1);
        expect(swapped).to.equal(0);
      });
    });

    async function swap({ swapper }: { swapper: SignerWithAddress }) {
      const { amountToBeProvidedBySwapper, tokenToBeProvidedBySwapper } = await getAmountToBeProvided();
      await tokenToBeProvidedBySwapper.connect(swapper).transfer(DCAHub.address, amountToBeProvidedBySwapper);
      await DCAHub.connect(swapper)['swap()']();
    }

    async function getAmountToBeProvided(): Promise<{ tokenToBeProvidedBySwapper: TokenContract; amountToBeProvidedBySwapper: BigNumber }> {
      const { amountToBeProvidedBySwapper, tokenToBeProvidedBySwapper } = await DCAHub.getNextSwapInfo();
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
