import { BigNumber, Contract } from 'ethers';
import { ethers } from 'hardhat';
import { DCAHubPositionHandlerMock__factory, DCAHubPositionHandlerMock } from '@typechained';
import { erc20, behaviours, constants, wallet } from '@test-utils';
import { expect } from 'chai';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { readArgFromEventOrFail } from '@test-utils/event-utils';
import { when, then, given, contract } from '@test-utils/bdd';
import { TokenContract } from '@test-utils/erc20';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import moment from 'moment';
import { snapshot } from '@test-utils/evm';

contract('DCAPositionHandler', () => {
  const PERFORMED_SWAPS_10 = 10;
  const POSITION_RATE_5 = 5;
  const POSITION_SWAPS_TO_PERFORM_10 = 10;
  const RATE_PER_UNIT_5 = 5;
  const SWAP_INTERVAL = moment.duration(1, 'days').as('seconds');
  const SWAP_INTERVAL_2 = moment.duration(2, 'days').as('seconds');

  const INITIAL_TOKEN_A_BALANCE_CONTRACT = 100;
  const INITIAL_TOKEN_A_BALANCE_USER = 100;
  const INITIAL_TOKEN_B_BALANCE_CONTRACT = 100;
  const INITIAL_TOKEN_B_BALANCE_USER = 100;

  let owner: SignerWithAddress, approved: SignerWithAddress, stranger: SignerWithAddress;
  let tokenA: TokenContract, tokenB: TokenContract;
  let DCAPositionHandlerContract: DCAHubPositionHandlerMock__factory;
  let DCAPositionHandler: DCAHubPositionHandlerMock;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    [owner, approved, stranger] = await ethers.getSigners();
    DCAPositionHandlerContract = await ethers.getContractFactory('contracts/mocks/DCAHub/DCAHubPositionHandler.sol:DCAHubPositionHandlerMock');

    const deploy = (decimals: number) => erc20.deploy({ name: 'A name', symbol: 'SYMB', decimals });

    const tokens = await Promise.all([deploy(12), deploy(16)]);
    [tokenA, tokenB] = tokens.sort((a, b) => a.address.localeCompare(b.address));
    await tokenA.mint(owner.address, tokenA.asUnits(INITIAL_TOKEN_A_BALANCE_USER));
    await tokenB.mint(owner.address, tokenB.asUnits(INITIAL_TOKEN_B_BALANCE_USER));
    DCAPositionHandler = await DCAPositionHandlerContract.deploy(
      tokenA.address,
      tokenB.address,
      owner.address,
      owner.address,
      constants.NOT_ZERO_ADDRESS,
      constants.NOT_ZERO_ADDRESS
    );
    await tokenA.approveInternal(owner.address, DCAPositionHandler.address, tokenA.asUnits(1000));
    await tokenB.approveInternal(owner.address, DCAPositionHandler.address, tokenB.asUnits(1000));
    await tokenA.mint(DCAPositionHandler.address, tokenA.asUnits(INITIAL_TOKEN_A_BALANCE_CONTRACT));
    await tokenB.mint(DCAPositionHandler.address, tokenB.asUnits(INITIAL_TOKEN_B_BALANCE_CONTRACT));
    await DCAPositionHandler.setInternalBalance(tokenA.address, tokenA.asUnits(INITIAL_TOKEN_A_BALANCE_CONTRACT));
    await DCAPositionHandler.setInternalBalance(tokenB.address, tokenB.asUnits(INITIAL_TOKEN_B_BALANCE_CONTRACT));
    await tokenA.mint(approved.address, tokenA.asUnits(INITIAL_TOKEN_A_BALANCE_USER));
    await tokenA.approveInternal(approved.address, DCAPositionHandler.address, tokenA.asUnits(1000));
    await DCAPositionHandler.setPerformedSwaps(tokenA.address, tokenB.address, SWAP_INTERVAL, PERFORMED_SWAPS_10);
    await DCAPositionHandler.addSwapIntervalsToAllowedList([SWAP_INTERVAL, SWAP_INTERVAL_2], ['NULL', 'NULL2']);
    snapshotId = await snapshot.take();
  });

  beforeEach('Deploy and configure', async () => {
    await snapshot.revert(snapshotId);
  });

  describe('constructor', () => {
    when('contract is initiated', () => {
      then('name and symbol are created based on token pair', async () => {
        const name = await DCAPositionHandler.name();
        const symbol = await DCAPositionHandler.symbol();
        expect(name).to.equal(`DCA: ${await tokenA.symbol()} - ${await tokenB.symbol()}`);
        expect(symbol).to.equal('DCA');
      });
    });
  });

  describe('deposit', () => {
    const depositShouldRevert = ({
      owner,
      address,
      rate,
      swaps,
      error,
    }: {
      owner: string;
      address: string;
      rate: number;
      swaps: number;
      error: string;
    }) =>
      behaviours.txShouldRevertWithMessage({
        contract: DCAPositionHandler,
        func: 'deposit',
        args: [owner, address, rate, swaps, SWAP_INTERVAL],
        message: error,
      });

    when('making a deposit to a zero address recipient', () => {
      then('tx is reverted with message', async () => {
        await depositShouldRevert({
          owner: constants.ZERO_ADDRESS,
          address: tokenA.address,
          rate: POSITION_RATE_5,
          swaps: POSITION_SWAPS_TO_PERFORM_10,
          error: 'ZeroAddress',
        });
      });
    });

    when('making a deposit with an unknown token address', () => {
      then('tx is reverted with message', async () => {
        await depositShouldRevert({
          owner: constants.NOT_ZERO_ADDRESS,
          address: constants.NOT_ZERO_ADDRESS,
          rate: POSITION_RATE_5,
          swaps: POSITION_SWAPS_TO_PERFORM_10,
          error: 'InvalidToken',
        });
      });
    });

    when('making a deposit with non-allowed interval', async () => {
      given(async () => {
        await DCAPositionHandler.removeSwapIntervalsFromAllowedList([SWAP_INTERVAL]);
      });
      then('tx is reverted with messasge', async () => {
        await depositShouldRevert({
          owner: constants.NOT_ZERO_ADDRESS,
          address: tokenA.address,
          rate: POSITION_RATE_5,
          swaps: POSITION_SWAPS_TO_PERFORM_10,
          error: 'InvalidInterval',
        });
      });
    });

    when('making a deposit with 0 rate', () => {
      then('tx is reverted with message', async () => {
        await depositShouldRevert({
          owner: constants.NOT_ZERO_ADDRESS,
          address: tokenA.address,
          rate: 0,
          swaps: POSITION_SWAPS_TO_PERFORM_10,
          error: 'ZeroRate',
        });
      });
    });

    when('making a deposit with 0 swaps', () => {
      then('tx is reverted with message', async () => {
        await depositShouldRevert({
          owner: constants.NOT_ZERO_ADDRESS,
          address: tokenA.address,
          rate: POSITION_RATE_5,
          swaps: 0,
          error: 'ZeroSwaps',
        });
      });
    });

    when('making a valid deposit', async () => {
      let dcaId: BigNumber;
      let tx: TransactionResponse;

      const nftOwner = wallet.generateRandomAddress();

      given(async () => {
        const depositTx = await deposit({ owner: nftOwner, token: tokenA, rate: POSITION_RATE_5, swaps: POSITION_SWAPS_TO_PERFORM_10 });
        tx = depositTx.response;
        dcaId = depositTx.dcaId;
      });

      then('event is emitted correctly', async () => {
        await expect(tx)
          .to.emit(DCAPositionHandler, 'Deposited')
          .withArgs(
            owner.address,
            nftOwner,
            1,
            tokenA.address,
            tokenA.asUnits(POSITION_RATE_5),
            PERFORMED_SWAPS_10 + 1,
            SWAP_INTERVAL,
            PERFORMED_SWAPS_10 + POSITION_SWAPS_TO_PERFORM_10
          );
      });

      then('correct amount is transferred from sender', async () => {
        await expectBalanceToBe(tokenA, owner.address, INITIAL_TOKEN_A_BALANCE_USER - POSITION_RATE_5 * POSITION_SWAPS_TO_PERFORM_10);
        await expectBalanceToBe(
          tokenA,
          DCAPositionHandler.address,
          INITIAL_TOKEN_A_BALANCE_CONTRACT + POSITION_RATE_5 * POSITION_SWAPS_TO_PERFORM_10
        );
      });

      then('position is created', async () => {
        await expectPositionToBe(dcaId, {
          from: tokenA,
          rate: POSITION_RATE_5,
          swapsExecuted: 0,
          swapsLeft: POSITION_SWAPS_TO_PERFORM_10,
          swapped: 0,
          remaining: POSITION_RATE_5 * POSITION_SWAPS_TO_PERFORM_10,
        });
      });

      then('trade is recorded', async () => {
        const deltaPerformedSwaps = await DCAPositionHandler.swapAmountDelta(tokenA.address, tokenB.address, SWAP_INTERVAL, PERFORMED_SWAPS_10);
        const deltaFirstDay = await DCAPositionHandler.swapAmountDelta(tokenA.address, tokenB.address, SWAP_INTERVAL, PERFORMED_SWAPS_10 + 1);
        const deltaLastDay = await DCAPositionHandler.swapAmountDelta(
          tokenA.address,
          tokenB.address,
          SWAP_INTERVAL,
          PERFORMED_SWAPS_10 + POSITION_SWAPS_TO_PERFORM_10 + 1
        );

        expect(deltaPerformedSwaps).to.equal(0);
        expect(deltaFirstDay).to.equal(tokenA.asUnits(POSITION_RATE_5));
        expect(deltaLastDay).to.equal(tokenA.asUnits(POSITION_RATE_5).mul(-1));
      });

      then('other swap intervals remain unaffected', async () => {
        const deltaPerformedSwaps = await DCAPositionHandler.swapAmountDelta(
          tokenA.address,
          tokenB.address,
          SWAP_INTERVAL_2,
          PERFORMED_SWAPS_10
        );
        const deltaFirstDay = await DCAPositionHandler.swapAmountDelta(tokenA.address, tokenB.address, SWAP_INTERVAL_2, PERFORMED_SWAPS_10 + 1);
        const deltaLastDay = await DCAPositionHandler.swapAmountDelta(
          tokenA.address,
          tokenB.address,
          SWAP_INTERVAL_2,
          PERFORMED_SWAPS_10 + POSITION_SWAPS_TO_PERFORM_10
        );

        expect(deltaPerformedSwaps).to.equal(0);
        expect(deltaFirstDay).to.equal(0);
        expect(deltaLastDay).to.equal(0);
      });

      then('nft is created and assigned to owner', async () => {
        const tokenOwner = await DCAPositionHandler.ownerOf(dcaId);
        const balance = await DCAPositionHandler.balanceOf(nftOwner);
        expect(tokenOwner).to.equal(nftOwner);
        expect(balance).to.equal(1);
      });

      then('interval is now active', async () => {
        expect(await DCAPositionHandler.isSwapIntervalActive(tokenA.address, tokenB.address, SWAP_INTERVAL)).to.be.true;
      });

      thenInternalBalancesAreTheSameAsTokenBalances();
    });
  });

  describe('withdrawSwapped', () => {
    const recipient: string = wallet.generateRandomAddress();

    when('withdrawing with zero address recipient', () => {
      then('tx is reverted with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAPositionHandler,
          func: 'withdrawSwapped(uint256,address)',
          args: [0, constants.ZERO_ADDRESS],
          message: 'ZeroAddress',
        });
      });
    });

    when('withdrawing swapped with invalid id', () => {
      then('tx is reverted with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAPositionHandler,
          func: 'withdrawSwapped(uint256,address)',
          args: [100, recipient],
          message: 'InvalidPosition',
        });
      });
    });

    erc721PermissionTest(({ contract, dcaId }) => contract.withdrawSwapped(dcaId, recipient));

    when(`withdrawing swapped with position that didn't have swaps executed`, () => {
      let response: TransactionResponse;
      let dcaId: BigNumber;

      given(async () => {
        ({ dcaId } = await deposit({ owner: owner.address, token: tokenA, rate: POSITION_RATE_5, swaps: POSITION_SWAPS_TO_PERFORM_10 }));
        response = await withdrawSwapped(dcaId, owner.address);
      });

      then('event is emitted', async () => {
        await expect(response).to.emit(DCAPositionHandler, 'Withdrew').withArgs(owner.address, owner.address, dcaId, tokenB.address, 0);
      });

      then('no token transfer was made', async () => {
        await expectBalanceToBe(tokenA, owner.address, INITIAL_TOKEN_A_BALANCE_USER - POSITION_RATE_5 * POSITION_SWAPS_TO_PERFORM_10);
        await expectBalanceToBe(
          tokenA,
          DCAPositionHandler.address,
          INITIAL_TOKEN_A_BALANCE_CONTRACT + POSITION_RATE_5 * POSITION_SWAPS_TO_PERFORM_10
        );
      });

      then(`position wasn't modified`, async () => {
        await expectPositionToBe(dcaId, {
          from: tokenA,
          rate: POSITION_RATE_5,
          swapsExecuted: 0,
          swapsLeft: POSITION_SWAPS_TO_PERFORM_10,
          swapped: 0,
          remaining: POSITION_RATE_5 * POSITION_SWAPS_TO_PERFORM_10,
        });
      });

      thenInternalBalancesAreTheSameAsTokenBalances();
    });

    when(`withdrawing swapped with executed position`, () => {
      let response: TransactionResponse;
      let dcaId: BigNumber;

      given(async () => {
        ({ dcaId } = await deposit({ owner: owner.address, token: tokenA, rate: POSITION_RATE_5, swaps: POSITION_SWAPS_TO_PERFORM_10 }));
        await performTrade({
          swap: PERFORMED_SWAPS_10 + 1,
          ratio: RATE_PER_UNIT_5,
          amount: POSITION_RATE_5,
        });
      });

      when('withdrawing with recipient', () => {
        given(async () => {
          response = await withdrawSwapped(dcaId, recipient);
        });

        then('swapped tokens are sent to the user', async () => {
          const swapped = tokenB.asUnits(RATE_PER_UNIT_5 * POSITION_RATE_5);
          expect(await tokenB.balanceOf(recipient)).to.equal(swapped);
          await expectBalanceToBe(tokenB, DCAPositionHandler.address, INITIAL_TOKEN_B_BALANCE_CONTRACT);
        });

        then('position is updated', async () => {
          await expectPositionToBe(dcaId, {
            from: tokenA,
            rate: POSITION_RATE_5,
            swapsExecuted: 0,
            swapsLeft: POSITION_SWAPS_TO_PERFORM_10 - 1,
            swapped: 0,
            remaining: POSITION_RATE_5 * (POSITION_SWAPS_TO_PERFORM_10 - 1),
          });
        });

        then('event is emitted', async () => {
          const swapped = tokenB.asUnits(RATE_PER_UNIT_5 * POSITION_RATE_5);
          await expect(response).to.emit(DCAPositionHandler, 'Withdrew').withArgs(owner.address, recipient, dcaId, tokenB.address, swapped);
        });

        thenInternalBalancesAreTheSameAsTokenBalances();
      });
    });
  });

  describe('withdrawSwappedMany', () => {
    const recipient = wallet.generateRandomAddress();

    when('withdrawing with zero address recipient', () => {
      then('tx is reverted with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAPositionHandler,
          func: 'withdrawSwappedMany',
          args: [[0], constants.ZERO_ADDRESS],
          message: 'ZeroAddress',
        });
      });
    });

    when('withdrawing swapped with invalid id', () => {
      then('tx is reverted with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAPositionHandler,
          func: 'withdrawSwappedMany',
          args: [[100], recipient],
          message: 'InvalidPosition',
        });
      });
    });

    erc721PermissionTest(({ contract, dcaId }) => contract.withdrawSwappedMany([dcaId], recipient));

    when(`withdrawing swapped with positions that didn't have swaps executed`, () => {
      let response: TransactionResponse;
      let dcaId1: BigNumber, dcaId2: BigNumber;

      given(async () => {
        ({ dcaId: dcaId1 } = await deposit({
          owner: owner.address,
          token: tokenA,
          rate: POSITION_RATE_5,
          swaps: POSITION_SWAPS_TO_PERFORM_10,
        }));
        ({ dcaId: dcaId2 } = await deposit({
          owner: owner.address,
          token: tokenB,
          rate: POSITION_RATE_5,
          swaps: POSITION_SWAPS_TO_PERFORM_10,
        }));
        response = await withdrawSwappedMany([dcaId1, dcaId2], owner.address);
      });

      then('event is emitted', async () => {
        await expect(response).to.emit(DCAPositionHandler, 'WithdrewMany').withArgs(owner.address, owner.address, [dcaId1, dcaId2], 0, 0);
      });

      then('no token transfer was made', async () => {
        await expectBalanceToBe(tokenA, owner.address, INITIAL_TOKEN_A_BALANCE_USER - POSITION_RATE_5 * POSITION_SWAPS_TO_PERFORM_10);
        await expectBalanceToBe(
          tokenA,
          DCAPositionHandler.address,
          INITIAL_TOKEN_A_BALANCE_CONTRACT + POSITION_RATE_5 * POSITION_SWAPS_TO_PERFORM_10
        );
        await expectBalanceToBe(tokenB, owner.address, INITIAL_TOKEN_B_BALANCE_USER - POSITION_RATE_5 * POSITION_SWAPS_TO_PERFORM_10);
        await expectBalanceToBe(
          tokenB,
          DCAPositionHandler.address,
          INITIAL_TOKEN_B_BALANCE_CONTRACT + POSITION_RATE_5 * POSITION_SWAPS_TO_PERFORM_10
        );
      });

      then(`position wasn't modified`, async () => {
        await expectPositionToBe(dcaId1, {
          from: tokenA,
          rate: POSITION_RATE_5,
          swapsExecuted: 0,
          swapsLeft: POSITION_SWAPS_TO_PERFORM_10,
          swapped: 0,
          remaining: POSITION_RATE_5 * POSITION_SWAPS_TO_PERFORM_10,
        });
        await expectPositionToBe(dcaId2, {
          from: tokenB,
          rate: POSITION_RATE_5,
          swapsExecuted: 0,
          swapsLeft: POSITION_SWAPS_TO_PERFORM_10,
          swapped: 0,
          remaining: POSITION_RATE_5 * POSITION_SWAPS_TO_PERFORM_10,
        });
      });

      thenInternalBalancesAreTheSameAsTokenBalances();
    });

    when(`withdrawing swapped with executed positions`, () => {
      const POSITION_RATE_3 = 3;
      let response: TransactionResponse;
      let dcaId1: BigNumber, dcaId2: BigNumber;

      given(async () => {
        ({ dcaId: dcaId1 } = await deposit({
          owner: owner.address,
          token: tokenA,
          rate: POSITION_RATE_5,
          swaps: POSITION_SWAPS_TO_PERFORM_10,
        }));
        ({ dcaId: dcaId2 } = await deposit({
          owner: owner.address,
          token: tokenB,
          rate: POSITION_RATE_3,
          swaps: POSITION_SWAPS_TO_PERFORM_10,
        }));
        await performTrade({
          swap: PERFORMED_SWAPS_10 + 1,
          ratio: RATE_PER_UNIT_5,
          amount: POSITION_RATE_5,
          fromToken: tokenA,
        });
        await performTrade({
          swap: PERFORMED_SWAPS_10 + 1,
          ratio: RATE_PER_UNIT_5,
          amount: POSITION_RATE_3,
          fromToken: tokenB,
        });

        response = await withdrawSwappedMany([dcaId1, dcaId2], recipient);
      });

      then('swapped tokens are sent to the user', async () => {
        const tradedFromBToA = tokenA.asUnits(RATE_PER_UNIT_5 * POSITION_RATE_3);
        expect(await tokenA.balanceOf(recipient)).to.equal(tradedFromBToA);
        const tradedFromAToB = tokenB.asUnits(RATE_PER_UNIT_5 * POSITION_RATE_5);
        expect(await tokenB.balanceOf(recipient)).to.equal(tradedFromAToB);
      });

      then('position is updated', async () => {
        await expectPositionToBe(dcaId1, {
          from: tokenA,
          rate: POSITION_RATE_5,
          swapsExecuted: 0,
          swapsLeft: POSITION_SWAPS_TO_PERFORM_10 - 1,
          swapped: 0,
          remaining: POSITION_RATE_5 * (POSITION_SWAPS_TO_PERFORM_10 - 1),
        });
        await expectPositionToBe(dcaId2, {
          from: tokenB,
          rate: POSITION_RATE_3,
          swapsExecuted: 0,
          swapsLeft: POSITION_SWAPS_TO_PERFORM_10 - 1,
          swapped: 0,
          remaining: POSITION_RATE_3 * (POSITION_SWAPS_TO_PERFORM_10 - 1),
        });
      });

      then('event is emitted', async () => {
        const swappedA = tokenA.asUnits(RATE_PER_UNIT_5 * POSITION_RATE_3);
        const swappedB = tokenB.asUnits(RATE_PER_UNIT_5 * POSITION_RATE_5);
        await expect(response)
          .to.emit(DCAPositionHandler, 'WithdrewMany')
          .withArgs(owner.address, recipient, [dcaId1, dcaId2], swappedA, swappedB);
      });

      thenInternalBalancesAreTheSameAsTokenBalances();
    });
  });

  describe('terminate', () => {
    const recipientUnswapped = wallet.generateRandomAddress();
    const recipientSwapped = wallet.generateRandomAddress();

    when('withdrawing with zero address recipientUnswapped', () => {
      then('tx is reverted with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAPositionHandler,
          func: 'terminate',
          args: [0, constants.ZERO_ADDRESS, recipientSwapped],
          message: 'ZeroAddress',
        });
      });
    });

    when('withdrawing with zero address recipientSwapped', () => {
      then('tx is reverted with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAPositionHandler,
          func: 'terminate',
          args: [0, recipientUnswapped, constants.ZERO_ADDRESS],
          message: 'ZeroAddress',
        });
      });
    });

    when('terminating a position with invalid id', () => {
      then('tx is reverted with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAPositionHandler,
          func: 'terminate',
          args: [100, recipientUnswapped, recipientSwapped],
          message: 'InvalidPosition',
        });
      });
    });

    erc721PermissionTest(({ contract, dcaId }) => contract.terminate(dcaId, recipientUnswapped, recipientSwapped));

    when(`terminating a valid position`, () => {
      const swappedWhenTerminated = RATE_PER_UNIT_5 * POSITION_RATE_5;
      const unswappedWhenTerminated = (POSITION_SWAPS_TO_PERFORM_10 - 1) * POSITION_RATE_5;

      let response: TransactionResponse;
      let dcaId: BigNumber;

      given(async () => {
        ({ dcaId } = await deposit({ owner: owner.address, token: tokenA, rate: POSITION_RATE_5, swaps: POSITION_SWAPS_TO_PERFORM_10 }));

        await performTrade({
          swap: PERFORMED_SWAPS_10 + 1,
          ratio: RATE_PER_UNIT_5,
          amount: POSITION_RATE_5,
        });

        response = await terminate(dcaId, recipientUnswapped, recipientSwapped);
      });

      then('event is emitted', async () => {
        await expect(response)
          .to.emit(DCAPositionHandler, 'Terminated')
          .withArgs(
            owner.address,
            recipientUnswapped,
            recipientSwapped,
            dcaId,
            tokenA.asUnits(unswappedWhenTerminated),
            tokenB.asUnits(swappedWhenTerminated)
          );
      });

      then('un-swapped balance is returned', async () => {
        await expectBalanceToBe(tokenA, recipientUnswapped, unswappedWhenTerminated);
      });

      then('swapped balance is returned', async () => {
        await expectBalanceToBe(tokenB, recipientSwapped, swappedWhenTerminated);
      });

      then(`position is removed`, async () => {
        await expectPositionToBe(dcaId, {
          from: constants.ZERO_ADDRESS,
          rate: 0,
          swapsExecuted: 0,
          swapsLeft: 0,
          swapped: 0,
          remaining: 0,
          swapInterval: 0,
        });
      });

      then('nft is burned', async () => {
        const balance = await DCAPositionHandler.balanceOf(owner.address);
        expect(balance).to.equal(0);
      });

      thenInternalBalancesAreTheSameAsTokenBalances();
    });
  });

  describe('modifyRateAndSwaps', () => {
    when('modifying a position with invalid id', () => {
      then('tx is reverted with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAPositionHandler,
          func: 'modifyRateAndSwaps',
          args: [100, POSITION_RATE_5, POSITION_SWAPS_TO_PERFORM_10],
          message: 'InvalidPosition',
        });
      });
    });

    when('modifying a position with 0 rate', async () => {
      then('tx is reverted with message', async () => {
        const { dcaId } = await deposit({ owner: owner.address, token: tokenA, rate: POSITION_RATE_5, swaps: POSITION_SWAPS_TO_PERFORM_10 });

        await behaviours.txShouldRevertWithMessage({
          contract: DCAPositionHandler,
          func: 'modifyRateAndSwaps',
          args: [dcaId, 0, POSITION_SWAPS_TO_PERFORM_10],
          message: 'ZeroRate',
        });
      });
    });

    when('modifying a position many times', () => {
      const POSITION_RATE_6 = 6;
      const POSITION_RATE_7 = 7;

      then('the amount of swapped tokens is correct', async () => {
        const { dcaId } = await deposit({ owner: owner.address, token: tokenA, rate: POSITION_RATE_5, swaps: POSITION_SWAPS_TO_PERFORM_10 });

        // Execute first swap
        await performTrade({
          swap: PERFORMED_SWAPS_10 + 1,
          ratio: RATE_PER_UNIT_5,
          amount: POSITION_RATE_5,
        });

        // Modify the position
        await modifyRateAndSwaps(tokenA, dcaId, POSITION_RATE_6, POSITION_SWAPS_TO_PERFORM_10);

        // Execute second swap
        await performTrade({
          swap: PERFORMED_SWAPS_10 + 2,
          ratio: RATE_PER_UNIT_5 * 2,
          amount: POSITION_RATE_6,
        });

        // Modify the position once again
        await modifyRateAndSwaps(tokenA, dcaId, POSITION_RATE_7, POSITION_SWAPS_TO_PERFORM_10);

        // Execute final swap
        await performTrade({
          swap: PERFORMED_SWAPS_10 + 3,
          ratio: RATE_PER_UNIT_5 * 3,
          amount: POSITION_RATE_7,
        });

        const swapped = await calculateSwapped(dcaId);
        const amountSwapped = RATE_PER_UNIT_5 * (POSITION_RATE_5 + POSITION_RATE_6 + POSITION_RATE_7);
        expect(swapped).to.equal(tokenB.asUnits(amountSwapped));
      });
    });

    erc721PermissionTest(({ token, contract, dcaId }) => contract.modifyRateAndSwaps(dcaId, token.asUnits(9), 5));

    modifyPositionTest({
      title: `setting amount of swaps to 0`,
      initialRate: POSITION_RATE_5,
      initialSwaps: POSITION_SWAPS_TO_PERFORM_10,
      newRate: 9,
      newSwaps: 0,
      exec: ({ token, dcaId, newRate, newSwaps }) => modifyRateAndSwaps(token, dcaId, newRate, newSwaps),
    });

    modifyPositionTest({
      title: `re-allocating deposited rate and swaps of a valid position`,
      initialRate: POSITION_RATE_5,
      initialSwaps: POSITION_SWAPS_TO_PERFORM_10,
      newRate: 9,
      newSwaps: 5,
      exec: ({ token, dcaId, newRate, newSwaps }) => modifyRateAndSwaps(token, dcaId, newRate, newSwaps),
    });

    modifyPositionTest({
      title: `modifying a position so that it requires more funds`,
      initialRate: POSITION_RATE_5,
      initialSwaps: POSITION_SWAPS_TO_PERFORM_10,
      newRate: 11,
      newSwaps: 5,
      exec: ({ token, dcaId, newRate, newSwaps }) => modifyRateAndSwaps(token, dcaId, newRate, newSwaps),
    });

    modifyPositionTest({
      title: `modifying a position so that it requires less funds`,
      initialRate: POSITION_RATE_5,
      initialSwaps: POSITION_SWAPS_TO_PERFORM_10,
      newRate: 7,
      newSwaps: 5,
      exec: ({ token, dcaId, newRate, newSwaps }) => modifyRateAndSwaps(token, dcaId, newRate, newSwaps),
    });
  });

  describe('modifySwaps', () => {
    when('modifying a position with invalid id', () => {
      then('tx is reverted with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAPositionHandler,
          func: 'modifySwaps',
          args: [100, POSITION_SWAPS_TO_PERFORM_10],
          message: 'InvalidPosition',
        });
      });
    });

    modifyPositionTest({
      title: `setting amount of swaps to 0`,
      initialRate: POSITION_RATE_5,
      initialSwaps: POSITION_SWAPS_TO_PERFORM_10,
      newSwaps: 0,
      exec: ({ dcaId, newSwaps }) => modifySwaps(dcaId, newSwaps),
    });

    erc721PermissionTest(({ contract, dcaId }) => contract.modifySwaps(dcaId, POSITION_SWAPS_TO_PERFORM_10));

    modifyPositionTest({
      title: `calling modify with the same amount of swaps`,
      initialRate: POSITION_RATE_5,
      initialSwaps: POSITION_SWAPS_TO_PERFORM_10,
      newSwaps: POSITION_SWAPS_TO_PERFORM_10,
      exec: ({ dcaId, newSwaps }) => modifySwaps(dcaId, newSwaps),
    });

    modifyPositionTest({
      title: `modifying a position so that it requires more funds`,
      initialRate: POSITION_RATE_5,
      initialSwaps: POSITION_SWAPS_TO_PERFORM_10,
      newSwaps: POSITION_SWAPS_TO_PERFORM_10 - 2,
      exec: ({ dcaId, newSwaps }) => modifySwaps(dcaId, newSwaps),
    });

    modifyPositionTest({
      title: `modifying a position so that it requires less funds`,
      initialRate: POSITION_RATE_5,
      initialSwaps: POSITION_SWAPS_TO_PERFORM_10,
      newSwaps: POSITION_SWAPS_TO_PERFORM_10 + 2,
      exec: ({ dcaId, newSwaps }) => modifySwaps(dcaId, newSwaps),
    });
  });

  describe('addFundsToPosition', () => {
    const NEW_SWAPS_TO_PERFORM_5 = 5;
    const EXTRA_AMOUNT_TO_ADD_1 = 1;

    when('adding funds to a position with invalid id', () => {
      then('tx is reverted with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAPositionHandler,
          func: 'addFundsToPosition',
          args: [100, tokenA.asUnits(EXTRA_AMOUNT_TO_ADD_1), POSITION_SWAPS_TO_PERFORM_10],
          message: 'InvalidPosition',
        });
      });
    });

    when('adding 0 funds to a position', () => {
      then('tx is reverted with message', async () => {
        const { dcaId } = await deposit({ owner: owner.address, token: tokenA, rate: POSITION_RATE_5, swaps: POSITION_SWAPS_TO_PERFORM_10 });

        await behaviours.txShouldRevertWithMessage({
          contract: DCAPositionHandler,
          func: 'addFundsToPosition',
          args: [dcaId, 0, POSITION_SWAPS_TO_PERFORM_10],
          message: 'ZeroAmount',
        });
      });
    });

    when('adding funds but with 0 swaps', () => {
      then('tx is reverted with message', async () => {
        const { dcaId } = await deposit({ owner: owner.address, token: tokenA, rate: POSITION_RATE_5, swaps: POSITION_SWAPS_TO_PERFORM_10 });

        await behaviours.txShouldRevertWithMessage({
          contract: DCAPositionHandler,
          func: 'addFundsToPosition',
          args: [dcaId, tokenA.asUnits(EXTRA_AMOUNT_TO_ADD_1), 0],
          message: 'ZeroSwaps',
        });
      });
    });

    erc721PermissionTest(({ token, contract, dcaId }) => contract.addFundsToPosition(dcaId, token.asUnits(1), 2));

    modifyPositionTest({
      title: `adding more funds to the position`,
      initialRate: POSITION_RATE_5,
      initialSwaps: POSITION_SWAPS_TO_PERFORM_10,
      newRate: ((POSITION_SWAPS_TO_PERFORM_10 - 1) * POSITION_RATE_5 + EXTRA_AMOUNT_TO_ADD_1) / NEW_SWAPS_TO_PERFORM_5, // We are subtracting one to the positions to perform, because there was one trade already
      newSwaps: NEW_SWAPS_TO_PERFORM_5,
      exec: ({ token, dcaId, newSwaps }) => addFundsToPosition(token, dcaId, EXTRA_AMOUNT_TO_ADD_1, newSwaps),
    });
  });

  describe('modifyRate', () => {
    when('modifying a position with invalid id', () => {
      then('tx is reverted with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAPositionHandler,
          func: 'modifyRate',
          args: [100, POSITION_RATE_5],
          message: 'InvalidPosition',
        });
      });
    });

    when('modifying a position with 0 rate', () => {
      then('tx is reverted with message', async () => {
        const { dcaId } = await deposit({ owner: owner.address, token: tokenA, rate: POSITION_RATE_5, swaps: POSITION_SWAPS_TO_PERFORM_10 });

        await behaviours.txShouldRevertWithMessage({
          contract: DCAPositionHandler,
          func: 'modifyRate',
          args: [dcaId, 0],
          message: 'ZeroRate',
        });
      });
    });

    erc721PermissionTest(({ token, contract, dcaId }) => contract.modifyRate(dcaId, token.asUnits(POSITION_RATE_5 - 2)));

    modifyPositionTest({
      title: `calling modify with the same rate`,
      initialRate: POSITION_RATE_5,
      initialSwaps: POSITION_SWAPS_TO_PERFORM_10,
      newRate: POSITION_RATE_5,
      newSwaps: POSITION_SWAPS_TO_PERFORM_10 - 1, // One swap was already executed
      exec: ({ token, dcaId, newRate }) => modifyRate(token, dcaId, newRate),
    });

    modifyPositionTest({
      title: `modifying a position so that it requires more funds`,
      initialRate: POSITION_RATE_5,
      initialSwaps: POSITION_SWAPS_TO_PERFORM_10,
      newRate: POSITION_RATE_5 - 2,
      newSwaps: POSITION_SWAPS_TO_PERFORM_10 - 1, // One swap was already executed
      exec: ({ token, dcaId, newRate }) => modifyRate(token, dcaId, newRate),
    });

    modifyPositionTest({
      title: `modifying a position so that it requires less funds`,
      initialRate: POSITION_RATE_5,
      initialSwaps: POSITION_SWAPS_TO_PERFORM_10,
      newRate: POSITION_RATE_5 + 2,
      newSwaps: POSITION_SWAPS_TO_PERFORM_10 - 1, // One swap was already executed
      exec: ({ token, dcaId, newRate }) => modifyRate(token, dcaId, newRate),
    });

    when('modifying the rate of a completed position', () => {
      then('then tx is reverted with message', async () => {
        const { dcaId } = await deposit({ owner: owner.address, token: tokenA, rate: POSITION_RATE_5, swaps: 1 });

        await performTrade({
          swap: PERFORMED_SWAPS_10 + 1,
          ratio: RATE_PER_UNIT_5,
          amount: POSITION_RATE_5,
        });

        await behaviours.txShouldRevertWithMessage({
          contract: DCAPositionHandler,
          func: 'modifyRate',
          args: [dcaId, POSITION_RATE_5 + 1],
          message: 'PositionCompleted',
        });
      });
    });
  });

  describe('_modifyPosition', () => {
    when('the swapped amount is too high', () => {
      let tx: Promise<TransactionResponse>;

      given(async () => {
        const { dcaId } = await deposit({ owner: owner.address, token: tokenA, rate: 1, swaps: 1 });
        await DCAPositionHandler.setPerformedSwaps(tokenA.address, tokenB.address, SWAP_INTERVAL, PERFORMED_SWAPS_10 + 1);
        await setRatio({
          accumRate: constants.MAX_UINT_256,
          onSwap: PERFORMED_SWAPS_10 + 1,
        });

        tx = DCAPositionHandler.modifyPosition(dcaId, 1, 1, 1, 1);
      });

      then('tx is reverted', async () => {
        await behaviours.checkTxRevertedWithMessage({
          tx,
          message: 'MandatoryWithdraw',
        });
      });
    });
  });

  describe('_calculateSwapped', () => {
    when('last swap ended before calculation', () => {
      then('swapped is calculated correctly', async () => {
        const { dcaId } = await deposit({ owner: owner.address, token: tokenA, rate: 1, swaps: 1 });

        // Set a value in PERFORMED_SWAPS_10 + 1
        await setRatio({
          accumRate: 1000000,
          onSwap: PERFORMED_SWAPS_10 + 1,
        });

        // Set another value in PERFORMED_SWAPS_10 + 2
        await setRatio({
          accumRate: 1000001,
          onSwap: PERFORMED_SWAPS_10 + 2,
        });

        await DCAPositionHandler.setPerformedSwaps(tokenA.address, tokenB.address, SWAP_INTERVAL, PERFORMED_SWAPS_10 + 3);

        // It shouldn't revert, since the position ended before the overflow
        const swapped = await calculateSwapped(dcaId);
        expect(swapped).to.equal(tokenB.asUnits(1000000));
      });
    });

    when(`last update happens after the position's last swap`, () => {
      then('0 is returned', async () => {
        const { dcaId } = await deposit({ owner: owner.address, token: tokenA, rate: 1, swaps: 1 });

        // Set a value in PERFORMED_SWAPS_10 + 1
        await setRatio({
          accumRate: 1000000,
          onSwap: PERFORMED_SWAPS_10 + 1,
        });

        // Set another value in PERFORMED_SWAPS_10 + 2
        await setRatio({
          accumRate: 1000001,
          onSwap: PERFORMED_SWAPS_10 + 2,
        });

        await DCAPositionHandler.setLastUpdated(dcaId, PERFORMED_SWAPS_10 + 2);
        await DCAPositionHandler.setPerformedSwaps(tokenA.address, tokenB.address, SWAP_INTERVAL, PERFORMED_SWAPS_10 + 2);

        const swapped = await calculateSwapped(dcaId);
        expect(swapped).to.equal(0);
      });
    });

    describe('verify overflow errors', () => {
      when('accum is MAX(uint256) and position rate is more than 1', () => {
        then('there is an overflow', async () => {
          await expectCalculationToFailWithOverflow({
            accumRate: constants.MAX_UINT_256,
            positionRate: 2,
          });
        });
      });
    });

    describe('verify overflow limits', () => {
      when('accum is MAX(uint256) and position rate is 1', () => {
        then('swapped should be max uint', async () => {
          const swapped = await calculateSwappedWith({
            accumRate: constants.MAX_UINT_256,
            positionRate: 1,
          });
          // We are losing precision when accumRate is MAX(uint256), but we accept that
          expect(swapped.gte('0xfffffffffffffffffffffffffffffffffffffffffffffffffff1c2d3019e0000')).to.true;
        });
      });
    });

    async function calculateSwappedWith({ accumRate, positionRate }: { accumRate: number | BigNumber; positionRate?: number }) {
      const { dcaId } = await deposit({ owner: owner.address, token: tokenA, rate: positionRate ?? 1, swaps: 1 });
      await DCAPositionHandler.setPerformedSwaps(tokenA.address, tokenB.address, SWAP_INTERVAL, PERFORMED_SWAPS_10 + 1);
      await setRatio({
        accumRate,
        onSwap: PERFORMED_SWAPS_10 + 1,
      });

      return calculateSwapped(dcaId);
    }

    async function expectCalculationToFailWithOverflow({ accumRate, positionRate }: { accumRate: number | BigNumber; positionRate: number }) {
      const { dcaId } = await deposit({ owner: owner.address, token: tokenA, rate: positionRate ?? 1, swaps: 1 });
      await DCAPositionHandler.setPerformedSwaps(tokenA.address, tokenB.address, SWAP_INTERVAL, PERFORMED_SWAPS_10 + 1);
      await setRatio({
        accumRate,
        onSwap: PERFORMED_SWAPS_10 + 1,
      });
      const tx = DCAPositionHandler.userPosition(dcaId) as any as Promise<TransactionResponse>;

      return behaviours.checkTxRevertedWithMessage({
        tx,
        message: 'reverted with panic code 0x11 (Arithmetic operation underflowed or overflowed outside of an unchecked block)',
      });
    }
  });

  async function setRatio({ accumRate, onSwap }: { accumRate: number | BigNumber; onSwap: number }) {
    await DCAPositionHandler.setAcummRatio(
      tokenA.address,
      tokenB.address,
      SWAP_INTERVAL,
      onSwap,
      BigNumber.isBigNumber(accumRate) ? accumRate : tokenB.asUnits(accumRate)
    );
  }

  /**
   * Verify that approved addresses can also execute the action, but that other addresses can't
   */
  function erc721PermissionTest(
    execute: (params: { token: TokenContract; contract: Contract; dcaId: BigNumber }) => Promise<TransactionResponse>
  ) {
    when(`executing address is approved for position`, () => {
      let dcaId: BigNumber;

      given(async () => {
        ({ dcaId } = await deposit({ owner: owner.address, token: tokenA, rate: POSITION_RATE_5, swaps: POSITION_SWAPS_TO_PERFORM_10 }));
        await DCAPositionHandler.approve(approved.address, dcaId);
      });

      then('they can execute the operation even if they are not the owner', async () => {
        const result: Promise<TransactionResponse> = execute({ token: tokenA, contract: DCAPositionHandler.connect(approved), dcaId });
        await expect(result).to.not.be.reverted;
      });
    });

    when(`executing address is approved for all`, () => {
      let dcaId: BigNumber;

      given(async () => {
        ({ dcaId } = await deposit({ owner: owner.address, token: tokenA, rate: POSITION_RATE_5, swaps: POSITION_SWAPS_TO_PERFORM_10 }));
        await DCAPositionHandler.setApprovalForAll(approved.address, true);
      });

      then('they can execute the operation even if they are not the owner', async () => {
        const result: Promise<TransactionResponse> = execute({ token: tokenA, contract: DCAPositionHandler.connect(approved), dcaId });
        await expect(result).to.not.be.reverted;
      });
    });

    when(`executing address isn't approved`, () => {
      let dcaId: BigNumber;

      given(async () => {
        ({ dcaId } = await deposit({ owner: owner.address, token: tokenA, rate: POSITION_RATE_5, swaps: POSITION_SWAPS_TO_PERFORM_10 }));
      });

      then('operation is reverted', async () => {
        const result: Promise<TransactionResponse> = execute({ token: tokenA, contract: DCAPositionHandler.connect(stranger), dcaId });
        await expect(result).to.be.revertedWith('UnauthorizedCaller');
      });
    });
  }

  function modifyPositionTest({
    title,
    initialRate,
    initialSwaps,
    newRate,
    newSwaps,
    exec,
  }: {
    title: string;
    initialRate: number;
    initialSwaps: number;
    newRate?: number;
    newSwaps?: number;
    exec: (params: { token: TokenContract; dcaId: BigNumber; newRate: number; newSwaps: number }) => Promise<TransactionResponse>;
  }) {
    newRate = newRate ?? initialRate;
    newSwaps = newSwaps ?? initialSwaps;

    const PERFORMED_SWAPS_11 = 11;

    when(title, () => {
      let response: TransactionResponse;
      let dcaId: BigNumber;

      given(async () => {
        ({ dcaId } = await deposit({ owner: owner.address, token: tokenA, rate: initialRate, swaps: initialSwaps }));

        await performTrade({
          swap: PERFORMED_SWAPS_10 + 1,
          ratio: RATE_PER_UNIT_5,
          amount: initialRate,
        });

        response = await exec({
          token: tokenA,
          dcaId,
          newRate: newRate!,
          newSwaps: newSwaps!,
        });
      });

      then('event is emitted', async () => {
        await expect(response)
          .to.emit(DCAPositionHandler, 'Modified')
          .withArgs(owner.address, dcaId, tokenA.asUnits(newRate!), PERFORMED_SWAPS_11 + 1, PERFORMED_SWAPS_10 + newSwaps! + 1);
      });

      then('final balances are as expected', async () => {
        await expectBalanceToBe(
          tokenA,
          owner.address,
          INITIAL_TOKEN_A_BALANCE_USER -
            initialRate * 1 - // Already executed trade
            newRate! * newSwaps! // New position
        );
        await expectBalanceToBe(tokenA, DCAPositionHandler.address, INITIAL_TOKEN_A_BALANCE_USER + newRate! * newSwaps!);
        await expectBalanceToBe(tokenB, owner.address, INITIAL_TOKEN_B_BALANCE_USER);
        const expectedRate = tokenB.asUnits(RATE_PER_UNIT_5 * initialRate);
        await expectBalanceToBe(tokenB, DCAPositionHandler.address, expectedRate.add(tokenB.asUnits(INITIAL_TOKEN_B_BALANCE_CONTRACT)));
      });

      then(`position is modified`, async () => {
        await expectPositionToBe(dcaId, {
          from: tokenA,
          rate: newRate!,
          swapsExecuted: 0,
          swapsLeft: newSwaps!,
          swapped: initialRate * RATE_PER_UNIT_5,
          remaining: newRate! * newSwaps!,
        });
      });

      then('previous trade is rolled back', async () => {
        // If it happens that this condition is true, then the new last swap will match the previous last swap, making the delta not 0
        if (PERFORMED_SWAPS_10 + initialSwaps + 1 !== PERFORMED_SWAPS_11 + newSwaps! + 1) {
          const deltaLastSwap = await DCAPositionHandler.swapAmountDelta(
            tokenA.address,
            tokenB.address,
            SWAP_INTERVAL,
            PERFORMED_SWAPS_10 + initialSwaps + 1
          );

          expect(deltaLastSwap).to.equal(0);
        }
      });

      then('new trade is recorded', async () => {
        const deltaNextSwap = await DCAPositionHandler.swapAmountDelta(tokenA.address, tokenB.address, SWAP_INTERVAL, PERFORMED_SWAPS_11 + 1);
        const deltaLastSwap = await DCAPositionHandler.swapAmountDelta(
          tokenA.address,
          tokenB.address,
          SWAP_INTERVAL,
          PERFORMED_SWAPS_11 + newSwaps! + 1
        );

        if (newSwaps! > 0) {
          expect(deltaNextSwap).to.equal(tokenA.asUnits((newRate! - initialRate).toFixed(2)));
          expect(deltaLastSwap).to.equal(tokenA.asUnits(newRate!).mul(-1));
        } else {
          expect(deltaLastSwap).to.equal(tokenA.asUnits(initialRate!).mul(-1));
        }
      });

      thenInternalBalancesAreTheSameAsTokenBalances();
    });
  }

  async function performTrade({ swap, ratio, amount, fromToken }: { swap: number; ratio: number; amount: number; fromToken?: TokenContract }) {
    const fromTokenReal = fromToken ?? tokenA;
    const toToken = fromTokenReal === tokenA ? tokenB : tokenA;
    await DCAPositionHandler.setPerformedSwaps(tokenA.address, tokenB.address, SWAP_INTERVAL, swap);
    await DCAPositionHandler.setAcummRatio(fromTokenReal.address, toToken.address, SWAP_INTERVAL, swap, toToken.asUnits(ratio));
    await fromTokenReal.burn(DCAPositionHandler.address, fromTokenReal.asUnits(amount));
    await toToken.mint(DCAPositionHandler.address, toToken.asUnits(amount * ratio));
    await DCAPositionHandler.setInternalBalance(tokenA.address, await tokenA.balanceOf(DCAPositionHandler.address));
    await DCAPositionHandler.setInternalBalance(tokenB.address, await tokenB.balanceOf(DCAPositionHandler.address));
  }

  function modifyRate(token: TokenContract, dcaId: BigNumber, rate: number): Promise<TransactionResponse> {
    return DCAPositionHandler.modifyRate(dcaId, token.asUnits(rate));
  }

  function modifySwaps(dcaId: BigNumber, swaps: number): Promise<TransactionResponse> {
    return DCAPositionHandler.modifySwaps(dcaId, swaps);
  }

  function modifyRateAndSwaps(token: TokenContract, dcaId: BigNumber, rate: number, swaps: number): Promise<TransactionResponse> {
    return DCAPositionHandler.modifyRateAndSwaps(dcaId, token.asUnits(rate), swaps);
  }

  function addFundsToPosition(token: TokenContract, dcaId: BigNumber, amount: number, swaps: number): Promise<TransactionResponse> {
    return DCAPositionHandler.addFundsToPosition(dcaId, token.asUnits(amount), swaps);
  }

  function withdrawSwapped(dcaId: BigNumber, recipient: string): Promise<TransactionResponse> {
    return DCAPositionHandler.withdrawSwapped(dcaId, recipient);
  }

  function withdrawSwappedMany(dcaIds: BigNumber[], recipient: string): Promise<TransactionResponse> {
    return DCAPositionHandler.withdrawSwappedMany(dcaIds, recipient);
  }

  function terminate(dcaId: BigNumber, recipientUnswapped: string, recipientSwapped: string): Promise<TransactionResponse> {
    return DCAPositionHandler.terminate(dcaId, recipientUnswapped, recipientSwapped);
  }

  async function calculateSwapped(dcaId: BigNumber): Promise<BigNumber> {
    const { swapped } = await DCAPositionHandler.userPosition(dcaId);
    return swapped;
  }

  async function deposit({ owner, token, rate, swaps }: { owner: string; token: TokenContract; rate: number; swaps: number }) {
    const response: TransactionResponse = await DCAPositionHandler.deposit(owner, token.address, token.asUnits(rate), swaps, SWAP_INTERVAL);
    const dcaId = await readArgFromEventOrFail<BigNumber>(response, 'Deposited', 'dcaId');
    return { response, dcaId };
  }

  async function expectBalanceToBe(token: TokenContract, address: string, amount: BigNumber | number) {
    const balance = await token.balanceOf(address);
    expect(balance).to.be.equal(BigNumber.isBigNumber(amount) ? amount : token.asUnits(amount));
  }

  function thenInternalBalancesAreTheSameAsTokenBalances() {
    then('internal balance for token A is as expected', async () => {
      const balance = await tokenA.balanceOf(DCAPositionHandler.address);
      const internalBalance = await DCAPositionHandler.internalBalanceOf(tokenA.address);
      expect(internalBalance).to.equal(balance);
    });

    then('internal balance for token B is as expected', async () => {
      const balance = await tokenB.balanceOf(DCAPositionHandler.address);
      const internalBalance = await DCAPositionHandler.internalBalanceOf(tokenB.address);
      expect(internalBalance).to.equal(balance);
    });
  }

  async function expectPositionToBe(
    dcaId: BigNumber,
    {
      from,
      rate,
      swapped,
      swapsLeft,
      remaining,
      swapsExecuted,
      swapInterval,
    }: {
      from: Contract | string;
      rate: number;
      swapsLeft: number;
      swapped: number;
      swapsExecuted: number;
      remaining: number;
      swapInterval?: number;
    }
  ) {
    const {
      from: positionFrom,
      to: positionTo,
      swapInterval: positionSwapInterval,
      swapsExecuted: positionSwapsExecuted,
      swapped: positionSwapped,
      swapsLeft: positionSwapsLeft,
      remaining: positionRemaining,
      rate: positionRate,
    }: [string, string, number, number, BigNumber, number, BigNumber, BigNumber] & {
      from: string;
      to: string;
      swapInterval: number;
      swapsExecuted: number;
      swapped: BigNumber;
      swapsLeft: number;
      remaining: BigNumber;
      rate: BigNumber;
    } = await DCAPositionHandler.userPosition(dcaId);
    const fromAddress = typeof from === 'string' ? from : from.address;
    const fromToken = fromAddress === tokenA.address ? tokenA : tokenB;
    const toToken = fromAddress === tokenA.address ? tokenB : tokenA;

    expect(positionFrom, 'Wrong from address in position').to.equal(fromAddress);
    expect(positionTo, 'Wrong to address in position').to.equal(
      fromAddress === constants.ZERO_ADDRESS ? constants.ZERO_ADDRESS : toToken.address
    );
    expect(positionSwapInterval, 'Wrong swap interval in position').to.equal(swapInterval ?? SWAP_INTERVAL);
    expect(positionSwapsExecuted, 'Wrong swaps executed in position').to.equal(swapsExecuted);
    expect(positionSwapped, 'Wrong swapped amount in position').to.equal(toToken.asUnits(swapped));
    expect(positionSwapsLeft, 'Wrong swaps left in position').to.equal(swapsLeft);
    expect(positionRemaining, 'Wrong remaining amount in position').to.equal(fromToken.asUnits(remaining));
    expect(positionRate, 'Wrong rate in position').to.equal(fromAddress === tokenA.address ? tokenA.asUnits(rate) : tokenB.asUnits(rate));
  }
});
