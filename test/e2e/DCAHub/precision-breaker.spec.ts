import { BigNumber, utils } from 'ethers';
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
import { constants, erc20, evm, wallet } from '@test-utils';
import { contract, given, then, when } from '@test-utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { TokenContract } from '@test-utils/erc20';
import { FakeContract, smock } from '@defi-wonderland/smock';
import { buildSwapInput } from 'js-lib/swap-utils';
import { SwapInterval } from 'js-lib/interval-utils';

contract('DCAHub', () => {
  describe('Precision breaker', () => {
    let governor: SignerWithAddress;
    let alice: SignerWithAddress, john: SignerWithAddress;
    let tokenA: TokenContract, tokenB: TokenContract;
    let DCAHubFactory: DCAHub__factory, DCAHub: DCAHub;
    let timeWeightedOracle: FakeContract<IUniswapV3OracleAggregator>;
    let DCAPermissionsManagerFactory: DCAPermissionsManager__factory, DCAPermissionsManager: DCAPermissionsManager;
    let DCAHubSwapCalleeFactory: DCAHubSwapCalleeMock__factory, DCAHubSwapCallee: DCAHubSwapCalleeMock;

    before('Setup accounts and contracts', async () => {
      [governor, alice, john] = await ethers.getSigners();
      DCAHubFactory = await ethers.getContractFactory('contracts/DCAHub/DCAHub.sol:DCAHub');
      DCAPermissionsManagerFactory = await ethers.getContractFactory(
        'contracts/DCAPermissionsManager/DCAPermissionsManager.sol:DCAPermissionsManager'
      );
      DCAHubSwapCalleeFactory = await ethers.getContractFactory('contracts/mocks/DCAHubSwapCallee.sol:DCAHubSwapCalleeMock');
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
      DCAPermissionsManager = await DCAPermissionsManagerFactory.deploy(constants.NOT_ZERO_ADDRESS, constants.NOT_ZERO_ADDRESS);
      DCAHub = await DCAHubFactory.deploy(governor.address, governor.address, timeWeightedOracle.address, DCAPermissionsManager.address);
      DCAPermissionsManager.setHub(DCAHub.address);
      DCAHubSwapCallee = await DCAHubSwapCalleeFactory.deploy();
      await DCAHubSwapCallee.setInitialBalances([tokenA.address, tokenB.address], [tokenA.asUnits(2000), tokenB.asUnits(2000)]);
      await DCAHub.addSwapIntervalsToAllowedList([SwapInterval.ONE_HOUR.seconds]);
      await setInitialBalance(john, { tokenA: 0, tokenB: 1000 });
      await setInitialBalance(alice, { tokenA: 0, tokenB: 10000 });
      await setInitialBalance(DCAHubSwapCallee, { tokenA: 2000, tokenB: 2000 });
    });

    when('all swaps are done', () => {
      given(async () => {
        await tokenB.connect(alice).approve(DCAHub.address, constants.MAX_UINT_256);
        await DCAHub.connect(alice).deposit(
          tokenB.address,
          tokenA.address,
          BigNumber.from('89509558490300730500').mul(3),
          3,
          SwapInterval.ONE_HOUR.seconds,
          alice.address,
          []
        );

        await tokenB.connect(john).approve(DCAHub.address, constants.MAX_UINT_256);
        await DCAHub.connect(john).deposit(
          tokenB.address,
          tokenA.address,
          utils.parseEther('200').mul(5),
          5,
          SwapInterval.ONE_HOUR.seconds,
          john.address,
          []
        );

        await evm.advanceTimeAndBlock(SwapInterval.ONE_HOUR.seconds);
        timeWeightedOracle.quote.returns(BigNumber.from('2246'));
        await flashSwap({ callee: DCAHubSwapCallee });
        await evm.advanceTimeAndBlock(SwapInterval.ONE_HOUR.seconds);
        timeWeightedOracle.quote.returns(BigNumber.from('2209'));
        await flashSwap({ callee: DCAHubSwapCallee });
        await evm.advanceTimeAndBlock(SwapInterval.ONE_HOUR.seconds);
        timeWeightedOracle.quote.returns(BigNumber.from('2190'));
        await flashSwap({ callee: DCAHubSwapCallee });

        await DCAHub.connect(alice).withdrawSwapped(1, wallet.generateRandomAddress());

        await evm.advanceTimeAndBlock(SwapInterval.ONE_HOUR.seconds);
        timeWeightedOracle.quote.returns(BigNumber.from('2175'));
        await flashSwap({ callee: DCAHubSwapCallee });
        await evm.advanceTimeAndBlock(SwapInterval.ONE_HOUR.seconds);
        timeWeightedOracle.quote.returns(BigNumber.from('2216'));
        await flashSwap({ callee: DCAHubSwapCallee });
      });

      then('user can withdraw without any problems', async () => {
        await DCAHub.connect(john).withdrawSwapped(2, wallet.generateRandomAddress());
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
