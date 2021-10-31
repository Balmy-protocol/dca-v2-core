import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';
import {
  DCAHub,
  DCAHub__factory,
  DCAHubSwapCalleeMock,
  DCAHubSwapCalleeMock__factory,
  DCAPermissionsManager,
  DCAPermissionsManager__factory,
  IPriceOracle,
} from '@typechained';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { constants, erc20, evm } from '@test-utils';
import { contract, given, then, when } from '@test-utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { TokenContract } from '@test-utils/erc20';
import { readArgFromEventOrFail } from '@test-utils/event-utils';
import { buildSwapInput } from 'js-lib/swap-utils';
import { SwapInterval } from 'js-lib/interval-utils';
import { FakeContract, smock } from '@defi-wonderland/smock';
import { snapshot } from '@test-utils/evm';

contract('DCAHub', () => {
  // We are now making sure that positions can still be interacted with (without reverts) in certain contexts
  describe('Position Interaction', () => {
    const MAX_UINT_120 = BigNumber.from(2).pow(120).sub(1); // max(uint120)
    const TOTAL_AMOUNT_OF_SWAPS = 2;

    let snapshotId: string;

    let governor: SignerWithAddress, owner: SignerWithAddress;
    let tokenA: TokenContract, tokenB: TokenContract;
    let DCAHubFactory: DCAHub__factory, DCAHub: DCAHub;
    let priceOracle: FakeContract<IPriceOracle>;
    let DCAHubSwapCalleeFactory: DCAHubSwapCalleeMock__factory, DCAHubSwapCallee: DCAHubSwapCalleeMock;
    let DCAPermissionsManagerFactory: DCAPermissionsManager__factory, DCAPermissionsManager: DCAPermissionsManager;

    before('Setup accounts and contracts', async () => {
      [owner, governor] = await ethers.getSigners();
      DCAHubFactory = await ethers.getContractFactory('contracts/DCAHub/DCAHub.sol:DCAHub');
      DCAHubSwapCalleeFactory = await ethers.getContractFactory('contracts/mocks/DCAHubSwapCallee.sol:DCAHubSwapCalleeMock');
      DCAPermissionsManagerFactory = await ethers.getContractFactory(
        'contracts/DCAPermissionsManager/DCAPermissionsManager.sol:DCAPermissionsManager'
      );
      tokenA = await erc20.deploy({
        name: 'tokenA',
        symbol: 'TKNA',
        decimals: 12,
      });
      tokenB = await erc20.deploy({
        name: 'tokenB',
        symbol: 'TKNB',
        decimals: 16,
      });
      priceOracle = await smock.fake('IPriceOracle');
      priceOracle.quote.returns(tokenA.asUnits(1));
      DCAPermissionsManager = await DCAPermissionsManagerFactory.deploy(constants.NOT_ZERO_ADDRESS, constants.NOT_ZERO_ADDRESS);

      DCAHub = await DCAHubFactory.deploy(governor.address, governor.address, priceOracle.address, DCAPermissionsManager.address);
      await DCAPermissionsManager.setHub(DCAHub.address);
      await DCAHub.connect(governor).addSwapIntervalsToAllowedList([SwapInterval.ONE_DAY.seconds]);
      DCAHubSwapCallee = await DCAHubSwapCalleeFactory.deploy();
      snapshotId = await snapshot.take();
    });

    beforeEach('Deploy and configure', async () => {
      await snapshot.revert(snapshotId);
    });

    interactionTest({
      when: 'no swaps were executed for a position',
    });

    interactionTest({
      when: 'some swaps were executed for a position',
      context: () => flashSwap({ times: 1 }),
    });

    interactionTest({
      when: 'all swaps were executed for a position',
      context: () => flashSwap({ times: TOTAL_AMOUNT_OF_SWAPS }),
      allSwapsExecuted: true,
    });

    interactionTest({
      when: 'position was modified',
      context: async (positionId) => {
        await DCAHub.reducePosition(positionId, tokenA.asUnits(5), 2, owner.address);
      },
    });

    interactionTest({
      when: 'position was modified multiple times',
      context: async (positionId) => {
        await tokenA.mint(owner.address, tokenA.asUnits(20));
        await tokenA.approve(DCAHub.address, tokenA.asUnits(20));
        await DCAHub.increasePosition(positionId, tokenA.asUnits(5), 3);
        await DCAHub.increasePosition(positionId, tokenA.asUnits(15), 5);
      },
    });

    interactionTest({
      when: 'the owner withdraws even though no swaps were executed',
      context: async (positionId) => {
        await DCAHub.withdrawSwapped(positionId, owner.address);
      },
    });

    interactionTest({
      when: 'the owner withdraws after some swaps were executed',
      context: async (positionId) => {
        await flashSwap({ times: 1 });
        await DCAHub.withdrawSwapped(positionId, owner.address);
      },
    });

    interactionTest({
      when: 'the owner withdraws after all swaps were executed',
      context: async (positionId) => {
        await flashSwap({ times: TOTAL_AMOUNT_OF_SWAPS });
        await DCAHub.withdrawSwapped(positionId, owner.address);
      },
      allSwapsExecuted: true,
    });

    interactionTest({
      when: 'rate for a position is highest possible and no swaps were executed',
      initialRate: MAX_UINT_120,
    });

    interactionTest({
      when: 'rate for a position is highest possible and some swaps were executed',
      initialRate: MAX_UINT_120,
      context: async () => await flashSwap({ times: 1 }),
    });

    interactionTest({
      when: 'rate for a position is highest possible and all swaps were executed',
      initialRate: MAX_UINT_120,
      context: async () => await flashSwap({ times: TOTAL_AMOUNT_OF_SWAPS }),
      allSwapsExecuted: true,
    });

    function interactionTest({
      when: title,
      context,
      initialRate,
      allSwapsExecuted,
    }: {
      when: string;
      context?: (positionId: BigNumber) => Promise<void>;
      initialRate?: BigNumber;
      allSwapsExecuted?: boolean;
    }) {
      const DEFAULT_RATE = 5;
      when(title, () => {
        let positionId: BigNumber;
        let rate: BigNumber;

        given(async () => {
          rate = initialRate ?? tokenA.asUnits(DEFAULT_RATE);
          positionId = await deposit(rate, TOTAL_AMOUNT_OF_SWAPS);
          if (context) {
            await context(positionId);
          }
        });

        then('position can be queried correctly', async () => {
          await DCAHub.userPosition(positionId);
        });
        then('position can be withdrawn', async () => {
          await DCAHub.withdrawSwapped(positionId, owner.address);
        });
        then('position can be withdrawn by calling withdrawSwappedMany', async () => {
          await DCAHub.withdrawSwappedMany([{ token: tokenB.address, positionIds: [positionId] }], owner.address);
        });
        then('position can be increased', async () => {
          await tokenA.mint(owner.address, 20);
          await tokenA.approve(DCAHub.address, 20);
          await DCAHub.increasePosition(positionId, 20, 5);
        });
        if (!allSwapsExecuted) {
          then('position can be reduced', async () => {
            await DCAHub.reducePosition(positionId, 20, 5, owner.address);
          });
        }
        then('position can be terminated', async () => {
          await DCAHub.terminate(positionId, owner.address, owner.address);
        });
      });
    }

    async function deposit(rate: BigNumber, amountOfSwaps: number): Promise<BigNumber> {
      const amount = rate.mul(amountOfSwaps);
      await tokenA.mint(owner.address, amount);
      await tokenA.approve(DCAHub.address, amount);
      const response: TransactionResponse = await DCAHub.connect(owner).deposit(
        tokenA.address,
        tokenB.address,
        amount,
        amountOfSwaps,
        SwapInterval.ONE_DAY.seconds,
        owner.address,
        []
      );
      return await readArgFromEventOrFail<BigNumber>(response, 'Deposited', 'positionId');
    }

    async function flashSwap({ times }: { times: number }) {
      const { tokens, pairIndexes, borrow } = buildSwapInput([{ tokenA: tokenA.address, tokenB: tokenB.address }], []);
      for (let i = 0; i < times; i++) {
        const aBigNumber = BigNumber.from(2).pow(136).sub(1); // max(uint136)
        await tokenA.mint(DCAHubSwapCallee.address, aBigNumber);
        await tokenB.mint(DCAHubSwapCallee.address, aBigNumber);
        await DCAHubSwapCallee.setInitialBalances(
          [tokenA.address, tokenB.address],
          [await tokenA.balanceOf(DCAHubSwapCallee.address), await tokenB.balanceOf(DCAHubSwapCallee.address)]
        );
        await DCAHub.swap(tokens, pairIndexes, DCAHubSwapCallee.address, DCAHubSwapCallee.address, borrow, ethers.utils.randomBytes(5));
        await evm.advanceTimeAndBlock(SwapInterval.ONE_DAY.seconds);
      }
    }
  });
});
