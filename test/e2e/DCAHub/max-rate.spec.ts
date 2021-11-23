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
import { buildGetNextSwapInfoInput, buildSwapInput } from 'js-lib/swap-utils';
import { SwapInterval } from 'js-lib/interval-utils';
import { FakeContract, smock } from '@defi-wonderland/smock';
import { snapshot } from '@test-utils/evm';
import { expect } from 'chai';

contract('DCAHub', () => {
  // We are now making a test where a lot of positions use the max rate allowed
  describe('Max rate', () => {
    const MAX_UINT = BigNumber.from(2).pow(256).sub(1);
    const MAX_RATE = BigNumber.from(2).pow(120).sub(1); // max(uint120)
    const AMOUNT_OF_POSITIONS = 100;
    const TOTAL_AMOUNT_OF_SWAPS = 5;

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
      priceOracle.quote.returns(tokenA.address < tokenB.address ? tokenA.asUnits(1) : tokenB.asUnits(1));
      DCAPermissionsManager = await DCAPermissionsManagerFactory.deploy(constants.NOT_ZERO_ADDRESS, constants.NOT_ZERO_ADDRESS);
      DCAHub = await DCAHubFactory.deploy(governor.address, governor.address, priceOracle.address, DCAPermissionsManager.address);
      await DCAPermissionsManager.setHub(DCAHub.address);
      await DCAHub.connect(governor).addSwapIntervalsToAllowedList([SwapInterval.ONE_DAY.seconds]);
      DCAHubSwapCallee = await DCAHubSwapCalleeFactory.deploy();

      await tokenB.mint(DCAHubSwapCallee.address, MAX_UINT);
      await DCAHubSwapCallee.setInitialBalances([tokenA.address, tokenB.address], [0, MAX_UINT]);
      snapshotId = await snapshot.take();
    });

    beforeEach('Deploy and configure', async () => {
      await snapshot.revert(snapshotId);
    });

    when(`${AMOUNT_OF_POSITIONS} positions with the max rate are created and fully swapped`, () => {
      let positionIds: BigNumber[] = [];
      given(async () => {
        positionIds = await createPositions();
        await flashSwap({ times: TOTAL_AMOUNT_OF_SWAPS });
      });
      then('then they can be withdrawn', async () => {
        await DCAHub.withdrawSwappedMany([{ token: tokenB.address, positionIds }], owner.address);
        const expectedBalance = calculateSwapped();
        expect(await tokenB.balanceOf(owner.address)).to.equal(expectedBalance);
      });
      then('there is nothing left to swap', async () => {
        await assertThereIsNothingElseToSwap();
      });
    });

    async function createPositions(): Promise<BigNumber[]> {
      let positionIds: BigNumber[] = [];
      for (let i = 0; i < AMOUNT_OF_POSITIONS; i++) {
        positionIds.push(await deposit());
      }
      return positionIds;
    }

    async function assertThereIsNothingElseToSwap() {
      const { tokens, pairIndexes } = buildGetNextSwapInfoInput([{ tokenA: tokenA.address, tokenB: tokenB.address }], []);
      const { pairs } = await DCAHub.getNextSwapInfo(tokens, pairIndexes);
      expect(pairs[0].intervalsInSwap).to.equal('0x00');
    }

    function calculateSwapped() {
      const swapped = MAX_RATE.mul(TOTAL_AMOUNT_OF_SWAPS).mul(AMOUNT_OF_POSITIONS).mul(tokenB.magnitude).div(tokenA.magnitude);
      return subtractFee(0.6, swapped);
    }

    function subtractFee(fee: number, number: BigNumber) {
      const percent = 100;
      return number.mul(percent * percent - fee * percent).div(percent * percent);
    }

    async function deposit(): Promise<BigNumber> {
      const amount = MAX_RATE.mul(TOTAL_AMOUNT_OF_SWAPS);
      await tokenA.mint(owner.address, amount);
      await tokenA.approve(DCAHub.address, amount);
      const response: TransactionResponse = await DCAHub.connect(owner).deposit(
        tokenA.address,
        tokenB.address,
        amount,
        TOTAL_AMOUNT_OF_SWAPS,
        SwapInterval.ONE_DAY.seconds,
        owner.address,
        []
      );
      return await readArgFromEventOrFail<BigNumber>(response, 'Deposited', 'positionId');
    }

    async function flashSwap({ times }: { times: number }) {
      const { tokens, pairIndexes, borrow } = buildSwapInput([{ tokenA: tokenA.address, tokenB: tokenB.address }], []);
      for (let i = 0; i < times; i++) {
        await DCAHub.swap(tokens, pairIndexes, DCAHubSwapCallee.address, DCAHubSwapCallee.address, borrow, ethers.utils.randomBytes(5));
        await evm.advanceTimeAndBlock(SwapInterval.ONE_DAY.seconds);
      }
    }
  });
});
