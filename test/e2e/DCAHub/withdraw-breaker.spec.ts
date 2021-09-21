import moment from 'moment';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';
import { DCAHub, DCAHub__factory, DCAPermissionsManager, DCAPermissionsManager__factory, IUniswapV3OracleAggregator } from '@typechained';
import { abi as IUniswapV3OracleAggregatorABI } from '@artifacts/contracts/interfaces/ITimeWeightedOracle.sol/IUniswapV3OracleAggregator.json';
import { constants, erc20, evm } from '@test-utils';
import { contract, given, then, when } from '@test-utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { TokenContract } from '@test-utils/erc20';
import { FakeContract, smock } from '@defi-wonderland/smock';
import { buildGetNextSwapInfoInput, buildSwapInput } from 'js-lib/swap-utils';

contract('DCAHub', () => {
  describe('Withdraw breaker', () => {
    const SWAP_INTERVAL_1_HOUR = moment.duration(1, 'hour').as('seconds');

    let governor: SignerWithAddress;
    let alice: SignerWithAddress, john: SignerWithAddress, swapper: SignerWithAddress;
    let tokenA: TokenContract, tokenB: TokenContract;
    let DCAHubFactory: DCAHub__factory, DCAHub: DCAHub;
    let timeWeightedOracle: FakeContract<IUniswapV3OracleAggregator>;
    let DCAPermissionsManagerFactory: DCAPermissionsManager__factory, DCAPermissionsManager: DCAPermissionsManager;

    before('Setup accounts and contracts', async () => {
      [governor, alice, john, swapper] = await ethers.getSigners();
      DCAHubFactory = await ethers.getContractFactory('contracts/DCAHub/DCAHub.sol:DCAHub');
      DCAPermissionsManagerFactory = await ethers.getContractFactory(
        'contracts/DCAPermissionsManager/DCAPermissionsManager.sol:DCAPermissionsManager'
      );
    });

    beforeEach('Deploy and configure', async () => {
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
      DCAPermissionsManager = await DCAPermissionsManagerFactory.deploy(constants.NOT_ZERO_ADDRESS, constants.NOT_ZERO_ADDRESS);
      DCAHub = await DCAHubFactory.deploy(governor.address, governor.address, timeWeightedOracle.address, DCAPermissionsManager.address);
      await DCAPermissionsManager.setHub(DCAHub.address);
      await DCAHub.addSwapIntervalsToAllowedList([SWAP_INTERVAL_1_HOUR], ['1 hour']);
      await setInitialBalance(alice, { tokenA: 0, tokenB: 200 });
      await setInitialBalance(john, { tokenA: 0, tokenB: 1000 });
      await setInitialBalance(swapper, { tokenA: 2000, tokenB: 2000 });
      await timeWeightedOracle.quote.returns(BigNumber.from('2246'));
    });

    when('a withdraw is executed after position is finished', () => {
      given(async () => {
        await tokenB.connect(alice).approve(DCAHub.address, constants.MAX_UINT_256);
        await DCAHub.connect(alice).deposit(tokenB.address, tokenA.address, tokenB.asUnits(200), 1, SWAP_INTERVAL_1_HOUR, alice.address, []);

        await tokenB.connect(john).approve(DCAHub.address, constants.MAX_UINT_256);
        await DCAHub.connect(john).deposit(tokenB.address, tokenA.address, tokenB.asUnits(1000), 5, SWAP_INTERVAL_1_HOUR, john.address, []);

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
