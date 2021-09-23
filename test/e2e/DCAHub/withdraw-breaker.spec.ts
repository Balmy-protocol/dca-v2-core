import moment from 'moment';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';
import {
  DCAHub,
  DCAHubSwapCalleeMock,
  DCAHubSwapCalleeMock__factory,
  DCAHub__factory,
  DCAPermissionsManager,
  DCAPermissionsManager__factory,
  IUniswapV3OracleAggregator,
} from '@typechained';
import { abi as IUniswapV3OracleAggregatorABI } from '@artifacts/contracts/interfaces/ITimeWeightedOracle.sol/IUniswapV3OracleAggregator.json';
import { constants, erc20, evm } from '@test-utils';
import { contract, given, then, when } from '@test-utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { TokenContract } from '@test-utils/erc20';
import { FakeContract, smock } from '@defi-wonderland/smock';
import { buildSwapInput } from 'js-lib/swap-utils';

contract('DCAHub', () => {
  describe('Withdraw breaker', () => {
    const SWAP_INTERVAL_1_HOUR = moment.duration(1, 'hour').as('seconds');

    let governor: SignerWithAddress;
    let alice: SignerWithAddress, john: SignerWithAddress;
    let tokenA: TokenContract, tokenB: TokenContract;
    let DCAHubFactory: DCAHub__factory, DCAHub: DCAHub;
    let timeWeightedOracle: FakeContract<IUniswapV3OracleAggregator>;
    let DCAPermissionsManagerFactory: DCAPermissionsManager__factory, DCAPermissionsManager: DCAPermissionsManager;
    let DCAHubSwapCalleeFactory: DCAHubSwapCalleeMock__factory, DCAHubSwapCallee: DCAHubSwapCalleeMock;

    before('Setup accounts and contracts', async () => {
      [governor, alice, , john] = await ethers.getSigners();
      DCAHubFactory = await ethers.getContractFactory('contracts/DCAHub/DCAHub.sol:DCAHub');
      DCAPermissionsManagerFactory = await ethers.getContractFactory(
        'contracts/DCAPermissionsManager/DCAPermissionsManager.sol:DCAPermissionsManager'
      );
      DCAHubSwapCalleeFactory = await ethers.getContractFactory('contracts/mocks/DCAHubSwapCallee.sol:DCAHubSwapCalleeMock');
    });

    beforeEach('Deploy and configure', async () => {
      const deploy = () => erc20.deploy({ name: 'A name', symbol: 'SYMB' });
      const tokens = [await deploy(), await deploy()];
      [tokenA, tokenB] = tokens.sort((a, b) => a.address.localeCompare(b.address));
      timeWeightedOracle = await smock.fake(IUniswapV3OracleAggregatorABI);
      DCAPermissionsManager = await DCAPermissionsManagerFactory.deploy(constants.NOT_ZERO_ADDRESS, constants.NOT_ZERO_ADDRESS);
      DCAHub = await DCAHubFactory.deploy(governor.address, governor.address, timeWeightedOracle.address, DCAPermissionsManager.address);
      await DCAPermissionsManager.setHub(DCAHub.address);
      await DCAHub.addSwapIntervalsToAllowedList([SWAP_INTERVAL_1_HOUR], ['1 hour']);
      DCAHubSwapCallee = await DCAHubSwapCalleeFactory.deploy();
      await DCAHubSwapCallee.setInitialBalances([tokenA.address, tokenB.address], [tokenA.asUnits(2000), tokenB.asUnits(2000)]);
      await setInitialBalance(alice, { tokenA: 0, tokenB: 200 });
      await setInitialBalance(john, { tokenA: 0, tokenB: 1000 });
      await setInitialBalance(DCAHubSwapCallee, { tokenA: 2000, tokenB: 2000 });
      timeWeightedOracle.quote.returns(BigNumber.from('2246'));
    });

    when('a withdraw is executed after position is finished', () => {
      given(async () => {
        await tokenB.connect(alice).approve(DCAHub.address, constants.MAX_UINT_256);
        await DCAHub.connect(alice).deposit(tokenB.address, tokenA.address, tokenB.asUnits(200), 1, SWAP_INTERVAL_1_HOUR, alice.address, []);

        await tokenB.connect(john).approve(DCAHub.address, constants.MAX_UINT_256);
        await DCAHub.connect(john).deposit(tokenB.address, tokenA.address, tokenB.asUnits(1000), 5, SWAP_INTERVAL_1_HOUR, john.address, []);

        await flashSwap({ callee: DCAHubSwapCallee });
        await evm.advanceTimeAndBlock(SWAP_INTERVAL_1_HOUR);
        await flashSwap({ callee: DCAHubSwapCallee });

        await DCAHub.connect(alice).withdrawSwapped(1, alice.address);
      });

      then('the position can still be queried', async () => {
        const { swapped } = await DCAHub.userPosition(1);
        expect(swapped).to.equal(0);
      });
    });

    async function flashSwap({ callee }: { callee: HasAddress }) {
      const { tokens, pairIndexes, borrow } = buildSwapInput([{ tokenA: tokenA.address, tokenB: tokenB.address }], []);
      await DCAHub.swap(tokens, pairIndexes, borrow, callee.address, ethers.utils.randomBytes(5));
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
