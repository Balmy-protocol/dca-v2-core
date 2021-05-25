import { BigNumber, BigNumberish, Contract, ContractFactory, utils } from 'ethers';
import { ethers } from 'hardhat';
import { erc20, behaviours, constants } from '../../utils';
import { expect } from 'chai';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { expectNoEventWithName, readArgFromEventOrFail } from '../../utils/event-utils';
import { when, then, given } from '../../utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';

describe('DCAPositionHandler', () => {
  const PERFORMED_SWAPS_10 = 10;
  const POSITION_RATE_5 = 5;
  const POSITION_SWAPS_TO_PERFORM_10 = 10;
  const RATE_PER_UNIT_5 = 5;

  const INITIAL_TOKEN_A_BALANCE_CONTRACT = 100;
  const INITIAL_TOKEN_A_BALANCE_USER = 100;
  const INITIAL_TOKEN_B_BALANCE_CONTRACT = 100;
  const INITIAL_TOKEN_B_BALANCE_USER = 100;

  let owner: SignerWithAddress, approved: SignerWithAddress, stranger: SignerWithAddress, feeRecipient: SignerWithAddress;
  let tokenA: Contract, tokenB: Contract;
  let DCAPositionHandlerContract: ContractFactory;
  let DCAPositionHandler: Contract;
  let DCAFactoryContract: ContractFactory;
  let DCAFactory: Contract;

  before('Setup accounts and contracts', async () => {
    [owner, approved, stranger, feeRecipient] = await ethers.getSigners();
    DCAPositionHandlerContract = await ethers.getContractFactory(
      'contracts/mocks/DCAPair/DCAPairPositionHandler.sol:DCAPairPositionHandlerMock'
    );
    DCAFactoryContract = await ethers.getContractFactory('contracts/mocks/DCAFactory/DCAFactory.sol:DCAFactoryMock');
  });

  beforeEach('Deploy and configure', async () => {
    tokenA = await erc20.deploy({
      name: 'DAI',
      symbol: 'DAI',
      initialAccount: owner.address,
      initialAmount: fromEther(INITIAL_TOKEN_A_BALANCE_USER),
    });
    tokenB = await erc20.deploy({
      name: 'WBTC',
      symbol: 'WBTC',
      initialAccount: owner.address,
      initialAmount: fromEther(INITIAL_TOKEN_B_BALANCE_USER),
    });
    DCAFactory = await DCAFactoryContract.deploy(owner.address, feeRecipient.address);
    DCAPositionHandler = await DCAPositionHandlerContract.deploy(DCAFactory.address, tokenA.address, tokenB.address);
    await tokenA.approveInternal(owner.address, DCAPositionHandler.address, fromEther(1000));
    await tokenB.approveInternal(owner.address, DCAPositionHandler.address, fromEther(1000));
    await tokenA.mint(DCAPositionHandler.address, fromEther(INITIAL_TOKEN_A_BALANCE_CONTRACT));
    await tokenB.mint(DCAPositionHandler.address, fromEther(INITIAL_TOKEN_B_BALANCE_CONTRACT));
    await tokenA.mint(approved.address, fromEther(INITIAL_TOKEN_A_BALANCE_USER));
    await tokenA.approveInternal(approved.address, DCAPositionHandler.address, fromEther(1000));
    await DCAPositionHandler.setPerformedSwaps(PERFORMED_SWAPS_10);
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
    const depositShouldRevert = ({ address, rate, swaps, error }: { address: string; rate: number; swaps: number; error: string }) =>
      behaviours.txShouldRevertWithMessage({
        contract: DCAPositionHandler,
        func: 'deposit',
        args: [address, rate, swaps],
        message: error,
      });

    when('making a deposit with an unknown token address', () => {
      then('tx is reverted with message', async () => {
        await depositShouldRevert({
          address: constants.NOT_ZERO_ADDRESS,
          rate: POSITION_RATE_5,
          swaps: POSITION_SWAPS_TO_PERFORM_10,
          error: 'DCAPair: Invalid deposit address',
        });
      });
    });

    when('making a deposit with 0 rate', () => {
      then('tx is reverted with message', async () => {
        await depositShouldRevert({
          address: tokenA.address,
          rate: 0,
          swaps: POSITION_SWAPS_TO_PERFORM_10,
          error: 'DCAPair: Non-positive rate',
        });
      });
    });

    when('making a deposit with 0 swaps', () => {
      then('tx is reverted with message', async () => {
        await depositShouldRevert({
          address: tokenA.address,
          rate: POSITION_RATE_5,
          swaps: 0,
          error: 'DCAPair: Non-positive amount',
        });
      });
    });

    when('making a valid deposit', async () => {
      let dcaId: BigNumber;
      let tx: TransactionResponse;

      given(async () => {
        const depositTx = await deposit(tokenA, POSITION_RATE_5, POSITION_SWAPS_TO_PERFORM_10);
        tx = depositTx.response;
        dcaId = depositTx.dcaId;
      });

      then('event is emitted correctly', async () => {
        await expect(tx)
          .to.emit(DCAPositionHandler, 'Deposited')
          .withArgs(
            owner.address,
            1,
            tokenA.address,
            fromEther(POSITION_RATE_5),
            PERFORMED_SWAPS_10 + 1,
            PERFORMED_SWAPS_10 + POSITION_SWAPS_TO_PERFORM_10
          );
      });

      then('correct amount is transferred from sender', async () => {
        await expectBalanceToBe(tokenA, owner.address, INITIAL_TOKEN_A_BALANCE_USER - POSITION_RATE_5 * POSITION_SWAPS_TO_PERFORM_10);
        await expectBalanceToBe(
          tokenA,
          DCAPositionHandler.address,
          INITIAL_TOKEN_A_BALANCE_USER + POSITION_RATE_5 * POSITION_SWAPS_TO_PERFORM_10
        );
      });

      then('position is created', async () => {
        await expectPositionToBe(dcaId, {
          from: tokenA,
          rate: POSITION_RATE_5,
          lastWithdrawSwap: PERFORMED_SWAPS_10,
          lastSwap: PERFORMED_SWAPS_10 + POSITION_SWAPS_TO_PERFORM_10,
        });
      });

      then('trade is recorded', async () => {
        const deltaPerformedSwaps = await DCAPositionHandler.swapAmountDelta(tokenA.address, PERFORMED_SWAPS_10);
        const deltaFirstDay = await DCAPositionHandler.swapAmountDelta(tokenA.address, PERFORMED_SWAPS_10 + 1);
        const deltaLastDay = await DCAPositionHandler.swapAmountDelta(tokenA.address, PERFORMED_SWAPS_10 + POSITION_SWAPS_TO_PERFORM_10);

        expect(deltaPerformedSwaps).to.equal(0);
        expect(deltaFirstDay).to.equal(fromEther(POSITION_RATE_5));
        expect(deltaLastDay).to.equal(fromEther(POSITION_RATE_5).mul(-1));
      });

      then('nft is created', async () => {
        const tokenOwner = await DCAPositionHandler.ownerOf(dcaId);
        const balance = await DCAPositionHandler.balanceOf(owner.address);
        expect(tokenOwner).to.equal(owner.address);
        expect(balance).to.equal(1);
      });
    });
  });

  describe('withdrawSwapped', () => {
    when('withdrawing swapped with invalid id', () => {
      then('tx is reverted with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAPositionHandler,
          func: 'withdrawSwapped',
          args: [100],
          message: 'DCAPair: Invalid position id',
        });
      });
    });

    erc721PermissionTest((contract, dcaId) => contract.withdrawSwapped(dcaId));

    when(`withdrawing swapped with position that didn't have swaps executed`, () => {
      let response: TransactionResponse;
      let dcaId: BigNumber;

      given(async () => {
        ({ dcaId } = await deposit(tokenA, POSITION_RATE_5, POSITION_SWAPS_TO_PERFORM_10));
        response = await withdrawSwapped(dcaId);
      });

      then('event is emitted', async () => {
        await expect(response).to.emit(DCAPositionHandler, 'Withdrew').withArgs(owner.address, dcaId, tokenB.address, 0);
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
          lastWithdrawSwap: PERFORMED_SWAPS_10,
          lastSwap: PERFORMED_SWAPS_10 + POSITION_SWAPS_TO_PERFORM_10,
        });
      });
    });

    when(`withdrawing swapped with executed position,`, () => {
      let response: TransactionResponse;
      let dcaId: BigNumber;

      given(async () => {
        ({ dcaId } = await deposit(tokenA, POSITION_RATE_5, POSITION_SWAPS_TO_PERFORM_10));
        await performTrade({
          swap: PERFORMED_SWAPS_10 + 1,
          ratePerUnit: RATE_PER_UNIT_5,
          amount: POSITION_RATE_5,
        });
        response = await withdrawSwapped(dcaId);
      });

      then('swapped tokens are sent to the user', async () => {
        const swapped = fromEther(RATE_PER_UNIT_5 * POSITION_RATE_5);
        const fee = await getFeeFrom(swapped);
        expect(await tokenB.balanceOf(owner.address)).to.equal(fromEther(INITIAL_TOKEN_B_BALANCE_USER).add(swapped).sub(fee));
        await expectBalanceToBe(tokenB, DCAPositionHandler.address, INITIAL_TOKEN_B_BALANCE_CONTRACT);
      });

      then('position is updated', async () => {
        await expectPositionToBe(dcaId, {
          from: tokenA,
          rate: POSITION_RATE_5,
          lastWithdrawSwap: PERFORMED_SWAPS_10 + 1,
          lastSwap: PERFORMED_SWAPS_10 + POSITION_SWAPS_TO_PERFORM_10,
        });
      });

      then('event is emitted', async () => {
        const swapped = fromEther(RATE_PER_UNIT_5 * POSITION_RATE_5);
        const swappedWithFeeApplied = await withFeeApplied(swapped);
        await expect(response).to.emit(DCAPositionHandler, 'Withdrew').withArgs(owner.address, dcaId, tokenB.address, swappedWithFeeApplied);
      });

      then('calculateSwapped returns 0', async () => {
        const swapped = await DCAPositionHandler.calculateSwapped(dcaId);
        expect(swapped).to.equal(0);
      });
    });
  });

  describe('withdrawSwappedMany', () => {
    when('withdrawing swapped with invalid id', () => {
      then('tx is reverted with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAPositionHandler,
          func: 'withdrawSwappedMany',
          args: [[100]],
          message: 'DCAPair: Invalid position id',
        });
      });
    });

    erc721PermissionTest((contract, dcaId) => contract.withdrawSwappedMany([dcaId]));

    when(`withdrawing swapped with positions that didn't have swaps executed`, () => {
      let response: TransactionResponse;
      let dcaId1: BigNumber, dcaId2: BigNumber;

      given(async () => {
        ({ dcaId: dcaId1 } = await deposit(tokenA, POSITION_RATE_5, POSITION_SWAPS_TO_PERFORM_10));
        ({ dcaId: dcaId2 } = await deposit(tokenB, POSITION_RATE_5, POSITION_SWAPS_TO_PERFORM_10));
        response = await withdrawSwappedMany(dcaId1, dcaId2);
      });

      then('event is emitted', async () => {
        await expect(response).to.emit(DCAPositionHandler, 'WithdrewMany').withArgs(owner.address, [dcaId1, dcaId2], 0, 0);
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
          lastWithdrawSwap: PERFORMED_SWAPS_10,
          lastSwap: PERFORMED_SWAPS_10 + POSITION_SWAPS_TO_PERFORM_10,
        });
        await expectPositionToBe(dcaId2, {
          from: tokenB,
          rate: POSITION_RATE_5,
          lastWithdrawSwap: PERFORMED_SWAPS_10,
          lastSwap: PERFORMED_SWAPS_10 + POSITION_SWAPS_TO_PERFORM_10,
        });
      });
    });

    when(`withdrawing swapped with executed positions`, () => {
      const POSITION_RATE_3 = 3;
      let response: TransactionResponse;
      let dcaId1: BigNumber, dcaId2: BigNumber;

      given(async () => {
        ({ dcaId: dcaId1 } = await deposit(tokenA, POSITION_RATE_5, POSITION_SWAPS_TO_PERFORM_10));
        ({ dcaId: dcaId2 } = await deposit(tokenB, POSITION_RATE_3, POSITION_SWAPS_TO_PERFORM_10));
        await performTrade({
          swap: PERFORMED_SWAPS_10 + 1,
          ratePerUnit: RATE_PER_UNIT_5,
          amount: POSITION_RATE_5,
          fromToken: tokenA,
        });
        await performTrade({
          swap: PERFORMED_SWAPS_10 + 1,
          ratePerUnit: RATE_PER_UNIT_5,
          amount: POSITION_RATE_3,
          fromToken: tokenB,
        });

        response = await withdrawSwappedMany(dcaId1, dcaId2);
      });

      then('swapped tokens are sent to the user', async () => {
        const tradedFromBToA = fromEther(RATE_PER_UNIT_5 * POSITION_RATE_3);
        const feeTradeFromBToA = await getFeeFrom(tradedFromBToA);
        const depositedToA = fromEther(POSITION_RATE_5 * POSITION_SWAPS_TO_PERFORM_10);
        expect(await tokenA.balanceOf(owner.address)).to.equal(
          fromEther(INITIAL_TOKEN_A_BALANCE_USER)
            .add(
              tradedFromBToA // Traded from B to A
            )
            .sub(
              feeTradeFromBToA // We take into account fee from the trade b to a
            )
            .sub(
              depositedToA // Deposited to A
            )
        );
        const tradedFromAToB = fromEther(RATE_PER_UNIT_5 * POSITION_RATE_5);
        const feeTradeFromAToB = await getFeeFrom(tradedFromAToB);
        const depositedToB = fromEther(POSITION_RATE_3 * POSITION_SWAPS_TO_PERFORM_10);
        expect(await tokenB.balanceOf(owner.address)).to.equal(
          fromEther(INITIAL_TOKEN_B_BALANCE_USER)
            .add(
              tradedFromAToB // Traded from A to B
            )
            .sub(
              feeTradeFromAToB // We take into account fee from the trade a to b
            )
            .sub(
              depositedToB // Deposited to B
            )
        );
      });

      then('position is updated', async () => {
        await expectPositionToBe(dcaId1, {
          from: tokenA,
          rate: POSITION_RATE_5,
          lastWithdrawSwap: PERFORMED_SWAPS_10 + 1,
          lastSwap: PERFORMED_SWAPS_10 + POSITION_SWAPS_TO_PERFORM_10,
        });
        await expectPositionToBe(dcaId2, {
          from: tokenB,
          rate: POSITION_RATE_3,
          lastWithdrawSwap: PERFORMED_SWAPS_10 + 1,
          lastSwap: PERFORMED_SWAPS_10 + POSITION_SWAPS_TO_PERFORM_10,
        });
      });

      then('calculateSwapped returns 0', async () => {
        const swapped1 = await DCAPositionHandler.calculateSwapped(dcaId1);
        const swapped2 = await DCAPositionHandler.calculateSwapped(dcaId2);
        expect(swapped1).to.equal(0);
        expect(swapped2).to.equal(0);
      });

      then('event is emitted', async () => {
        const swappedA = fromEther(RATE_PER_UNIT_5 * POSITION_RATE_3);
        const swappedB = fromEther(RATE_PER_UNIT_5 * POSITION_RATE_5);
        await expect(response)
          .to.emit(DCAPositionHandler, 'WithdrewMany')
          .withArgs(owner.address, [dcaId1, dcaId2], await withFeeApplied(swappedA), await withFeeApplied(swappedB));
      });
    });
  });

  describe('terminate', () => {
    when('terminating a position with invalid id', () => {
      then('tx is reverted with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAPositionHandler,
          func: 'terminate',
          args: [100],
          message: 'DCAPair: Invalid position id',
        });
      });
    });

    erc721PermissionTest((contract, dcaId) => contract.terminate(dcaId));

    when(`terminating a valid position`, () => {
      const swappedWhenTerminated = RATE_PER_UNIT_5 * POSITION_RATE_5;
      const unswappedWhenTerminated = (POSITION_SWAPS_TO_PERFORM_10 - 1) * POSITION_RATE_5;

      let response: TransactionResponse;
      let dcaId: BigNumber;

      given(async () => {
        ({ dcaId } = await deposit(tokenA, POSITION_RATE_5, POSITION_SWAPS_TO_PERFORM_10));

        await performTrade({
          swap: PERFORMED_SWAPS_10 + 1,
          ratePerUnit: RATE_PER_UNIT_5,
          amount: POSITION_RATE_5,
        });

        response = await terminate(dcaId);
      });

      then('event is emitted', async () => {
        await expect(response)
          .to.emit(DCAPositionHandler, 'Terminated')
          .withArgs(owner.address, dcaId, fromEther(unswappedWhenTerminated), await withFeeApplied(fromEther(swappedWhenTerminated)));
      });

      then('un-swapped balance is returned', async () => {
        await expectBalanceToBe(tokenA, owner.address, INITIAL_TOKEN_A_BALANCE_USER - POSITION_RATE_5);
        await expectBalanceToBe(tokenA, DCAPositionHandler.address, INITIAL_TOKEN_A_BALANCE_CONTRACT);
      });

      then('swapped balance is returned', async () => {
        const fee = await getFeeFrom(fromEther(swappedWhenTerminated));

        const userBalance = await tokenB.balanceOf(owner.address);
        expect(userBalance).to.be.equal(fromEther(INITIAL_TOKEN_B_BALANCE_USER + swappedWhenTerminated).sub(fee));

        await expectBalanceToBe(tokenB, DCAPositionHandler.address, INITIAL_TOKEN_B_BALANCE_CONTRACT);
      });

      then(`position is removed`, async () => {
        await expectPositionToBe(dcaId, {
          from: constants.ZERO_ADDRESS,
          rate: 0,
          lastWithdrawSwap: 0,
          lastSwap: 0,
        });
      });

      then('nft is burned', async () => {
        const balance = await DCAPositionHandler.balanceOf(owner.address);
        expect(balance).to.equal(0);
      });
    });
  });

  describe('modifyRateAndSwaps', () => {
    when('modifying a position with invalid id', () => {
      then('tx is reverted with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAPositionHandler,
          func: 'modifyRateAndSwaps',
          args: [100, POSITION_RATE_5, POSITION_SWAPS_TO_PERFORM_10],
          message: 'DCAPair: Invalid position id',
        });
      });
    });

    when('modifying a position with 0 rate', async () => {
      then('tx is reverted with message', async () => {
        const { dcaId } = await deposit(tokenA, POSITION_RATE_5, POSITION_SWAPS_TO_PERFORM_10);

        await behaviours.txShouldRevertWithMessage({
          contract: DCAPositionHandler,
          func: 'modifyRateAndSwaps',
          args: [dcaId, 0, POSITION_SWAPS_TO_PERFORM_10],
          message: 'DCAPair: Non-positive rate',
        });
      });
    });

    when('modifying a position with 0 swaps', () => {
      then('tx is reverted with message', async () => {
        const { dcaId } = await deposit(tokenA, POSITION_RATE_5, POSITION_SWAPS_TO_PERFORM_10);

        await behaviours.txShouldRevertWithMessage({
          contract: DCAPositionHandler,
          func: 'modifyRateAndSwaps',
          args: [dcaId, POSITION_RATE_5, 0],
          message: 'DCAPair: Non-positive amount',
        });
      });
    });

    when('modifying a position many times', () => {
      const POSITION_RATE_6 = 6;
      const POSITION_RATE_7 = 7;

      then('the amount of swapped tokens is correct', async () => {
        const { dcaId } = await deposit(tokenA, POSITION_RATE_5, POSITION_SWAPS_TO_PERFORM_10);

        // Execute first swap
        await performTrade({
          swap: PERFORMED_SWAPS_10 + 1,
          ratePerUnit: RATE_PER_UNIT_5,
          amount: POSITION_RATE_5,
        });

        // Modify the position
        await modifyRateAndSwaps(dcaId, POSITION_RATE_6, POSITION_SWAPS_TO_PERFORM_10);

        // Execute second swap
        await performTrade({
          swap: PERFORMED_SWAPS_10 + 2,
          ratePerUnit: RATE_PER_UNIT_5 * 2,
          amount: POSITION_RATE_6,
        });

        // Modify the position once again
        await modifyRateAndSwaps(dcaId, POSITION_RATE_7, POSITION_SWAPS_TO_PERFORM_10);

        // Execute final swap
        await performTrade({
          swap: PERFORMED_SWAPS_10 + 3,
          ratePerUnit: RATE_PER_UNIT_5 * 3,
          amount: POSITION_RATE_7,
        });

        const swapped = await DCAPositionHandler.calculateSwapped(dcaId);
        const amountSwapped = RATE_PER_UNIT_5 * (POSITION_RATE_5 + POSITION_RATE_6 + POSITION_RATE_7);
        const expected = await withFeeApplied(fromEther(amountSwapped));
        expect(swapped).to.equal(expected);
      });
    });

    erc721PermissionTest((contract, dcaId) => contract.modifyRateAndSwaps(dcaId, fromEther(9), 5));

    modifyPositionTest({
      title: `re-allocating deposited rate and swaps of a valid position`,
      initialRate: POSITION_RATE_5,
      initialSwaps: POSITION_SWAPS_TO_PERFORM_10,
      newRate: 9,
      newSwaps: 5,
      exec: ({ dcaId, newRate, newSwaps }) => modifyRateAndSwaps(dcaId, newRate, newSwaps),
    });

    modifyPositionTest({
      title: `modifying a position so that it requires more funds`,
      initialRate: POSITION_RATE_5,
      initialSwaps: POSITION_SWAPS_TO_PERFORM_10,
      newRate: 11,
      newSwaps: 5,
      exec: ({ dcaId, newRate, newSwaps }) => modifyRateAndSwaps(dcaId, newRate, newSwaps),
    });

    modifyPositionTest({
      title: `modifying a position so that it requires less funds`,
      initialRate: POSITION_RATE_5,
      initialSwaps: POSITION_SWAPS_TO_PERFORM_10,
      newRate: 7,
      newSwaps: 5,
      exec: ({ dcaId, newRate, newSwaps }) => modifyRateAndSwaps(dcaId, newRate, newSwaps),
    });
  });

  describe('modifySwaps', () => {
    when('modifying a position with invalid id', () => {
      then('tx is reverted with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAPositionHandler,
          func: 'modifySwaps',
          args: [100, POSITION_SWAPS_TO_PERFORM_10],
          message: 'DCAPair: Invalid position id',
        });
      });
    });

    when('modifying a position with 0 swaps', () => {
      then('tx is reverted with message', async () => {
        const { dcaId } = await deposit(tokenA, POSITION_RATE_5, POSITION_SWAPS_TO_PERFORM_10);

        await behaviours.txShouldRevertWithMessage({
          contract: DCAPositionHandler,
          func: 'modifySwaps',
          args: [dcaId, 0],
          message: 'DCAPair: Non-positive amount',
        });
      });
    });

    erc721PermissionTest((contract, dcaId) => contract.modifySwaps(dcaId, POSITION_SWAPS_TO_PERFORM_10));

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
          args: [100, fromEther(EXTRA_AMOUNT_TO_ADD_1), POSITION_SWAPS_TO_PERFORM_10],
          message: 'DCAPair: Invalid position id',
        });
      });
    });

    when('adding 0 funds to a position', () => {
      then('tx is reverted with message', async () => {
        const { dcaId } = await deposit(tokenA, POSITION_RATE_5, POSITION_SWAPS_TO_PERFORM_10);

        await behaviours.txShouldRevertWithMessage({
          contract: DCAPositionHandler,
          func: 'addFundsToPosition',
          args: [dcaId, 0, POSITION_SWAPS_TO_PERFORM_10],
          message: 'DCAPair: Non-positive amount',
        });
      });
    });

    erc721PermissionTest((contract, dcaId) => contract.addFundsToPosition(dcaId, fromEther(1), 2));

    modifyPositionTest({
      title: `adding more funds to the position`,
      initialRate: POSITION_RATE_5,
      initialSwaps: POSITION_SWAPS_TO_PERFORM_10,
      newRate: ((POSITION_SWAPS_TO_PERFORM_10 - 1) * POSITION_RATE_5 + EXTRA_AMOUNT_TO_ADD_1) / NEW_SWAPS_TO_PERFORM_5, // We are subtracting one to the positions to perform, because there was one trade already
      newSwaps: NEW_SWAPS_TO_PERFORM_5,
      exec: ({ dcaId, newSwaps }) => addFundsToPosition(dcaId, EXTRA_AMOUNT_TO_ADD_1, newSwaps),
    });
  });

  describe('modifyRate', () => {
    when('modifying a position with invalid id', () => {
      then('tx is reverted with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAPositionHandler,
          func: 'modifyRate',
          args: [100, POSITION_RATE_5],
          message: 'DCAPair: Invalid position id',
        });
      });
    });

    when('modifying a position with 0 rate', () => {
      then('tx is reverted with message', async () => {
        const { dcaId } = await deposit(tokenA, POSITION_RATE_5, POSITION_SWAPS_TO_PERFORM_10);

        await behaviours.txShouldRevertWithMessage({
          contract: DCAPositionHandler,
          func: 'modifyRate',
          args: [dcaId, 0],
          message: 'DCAPair: Non-positive rate',
        });
      });
    });

    erc721PermissionTest((contract, dcaId) => contract.modifyRate(dcaId, fromEther(POSITION_RATE_5 - 2)));

    modifyPositionTest({
      title: `calling modify with the same rate`,
      initialRate: POSITION_RATE_5,
      initialSwaps: POSITION_SWAPS_TO_PERFORM_10,
      newRate: POSITION_RATE_5,
      newSwaps: POSITION_SWAPS_TO_PERFORM_10 - 1, // One swap was already executed
      exec: ({ dcaId, newRate }) => modifyRate(dcaId, newRate),
    });

    modifyPositionTest({
      title: `modifying a position so that it requires more funds`,
      initialRate: POSITION_RATE_5,
      initialSwaps: POSITION_SWAPS_TO_PERFORM_10,
      newRate: POSITION_RATE_5 - 2,
      newSwaps: POSITION_SWAPS_TO_PERFORM_10 - 1, // One swap was already executed
      exec: ({ dcaId, newRate }) => modifyRate(dcaId, newRate),
    });

    modifyPositionTest({
      title: `modifying a position so that it requires less funds`,
      initialRate: POSITION_RATE_5,
      initialSwaps: POSITION_SWAPS_TO_PERFORM_10,
      newRate: POSITION_RATE_5 + 2,
      newSwaps: POSITION_SWAPS_TO_PERFORM_10 - 1, // One swap was already executed
      exec: ({ dcaId, newRate }) => modifyRate(dcaId, newRate),
    });

    when('modifying the rate of a completed position', () => {
      then('then tx is reverted with message', async () => {
        const { dcaId } = await deposit(tokenA, POSITION_RATE_5, 1);

        await performTrade({
          swap: PERFORMED_SWAPS_10 + 1,
          ratePerUnit: RATE_PER_UNIT_5,
          amount: POSITION_RATE_5,
        });

        await behaviours.txShouldRevertWithMessage({
          contract: DCAPositionHandler,
          func: 'modifyRate',
          args: [dcaId, POSITION_RATE_5 + 1],
          message: 'DCAPair: Position completed',
        });
      });
    });
  });

  describe('_modifyPosition', () => {
    const MAX = BigNumber.from(2).pow(248).sub(1);

    when('the swapped amount is too high', () => {
      let tx: Promise<TransactionResponse>;

      given(async () => {
        const { dcaId } = await deposit(tokenA, 1, 1);
        await DCAPositionHandler.setPerformedSwaps(PERFORMED_SWAPS_10 + 1);
        await setRatePerUnit({
          accumRate: MAX.add(1),
          rateMultiplier: 0,
          onSwap: PERFORMED_SWAPS_10 + 1,
        });

        tx = DCAPositionHandler.modifyPosition(dcaId, 1, 1, 1, 1);
      });

      then('tx is reverted', async () => {
        await behaviours.checkTxRevertedWithMessage({
          tx,
          message: 'DCAPair: Withdraw before',
        });
      });
    });

    when('the swapped amount just at the limit', () => {
      let dcaId: BigNumber;

      given(async () => {
        ({ dcaId } = await deposit(tokenA, 1, 1));
        await DCAPositionHandler.setPerformedSwaps(PERFORMED_SWAPS_10 + 1);
        await setRatePerUnit({
          accumRate: MAX,
          rateMultiplier: 0,
          onSwap: PERFORMED_SWAPS_10 + 1,
        });

        await DCAPositionHandler.modifyPosition(dcaId, 1, 1, 1, 1);
      });

      then('position is modified correctly', async () => {
        const { swappedBeforeModified } = await DCAPositionHandler.userPositions(dcaId);
        expect(swappedBeforeModified).to.equal(MAX);
      });
    });
  });

  describe('calculateSwapped', () => {
    when('multiplier is 1 and accum is negative', () => {
      then('swapped is calculated correctly', async () => {
        const swapped = await calculateSwappedWith({
          accumRate: -10,
          rateMultiplier: 1,
          fee: 0,
        });
        expect(swapped).to.equal(constants.MAX_UINT_256.sub(fromEther(10)));
      });
    });

    when('last swap ended before calculation', () => {
      then('swapped is calculated correctly', async () => {
        const { dcaId } = await deposit(tokenA, 1, 1);

        // Turn fees to zero
        await DCAFactory.setFee(0);

        // Set up max(uint256) in PERFORMED_SWAPS_10 + 1
        await setRatePerUnit({
          accumRate: 0,
          rateMultiplier: 1,
          onSwap: PERFORMED_SWAPS_10 + 1,
        });

        // Set up overflow in PERFORMED_SWAPS_10 + 2
        await setRatePerUnit({
          accumRate: 1,
          rateMultiplier: 1,
          onSwap: PERFORMED_SWAPS_10 + 2,
        });

        await DCAPositionHandler.setPerformedSwaps(PERFORMED_SWAPS_10 + 3);

        // It shouldn't revert, since the position ended before the overflow
        const swapped = await DCAPositionHandler.calculateSwapped(dcaId);
        expect(swapped).to.equal(constants.MAX_UINT_256);
      });
    });

    describe('verify overflow errors', () => {
      when('multiplier is 1 and accum is positive', () => {
        then('there is an overflow', async () => {
          await expectCalculationToFailWithOverflow({
            accumRate: 1,
            rateMultiplier: 1,
            fee: 0,
          });
        });
      });

      when('multiplier is 2 and accum is not -MAX(uint256)', () => {
        then('there is an overflow', async () => {
          await expectCalculationToFailWithOverflow({
            accumRate: constants.MAX_UINT_256.mul(-1).add(1),
            rateMultiplier: 2,
            fee: 0,
          });
        });
      });

      when('multiplier is 3', () => {
        then('there is an overflow', async () => {
          await expectCalculationToFailWithOverflow({
            accumRate: constants.MAX_UINT_256.mul(-1),
            rateMultiplier: 3,
            fee: 0,
          });
        });
      });
    });

    describe('verify overflow limits', () => {
      when('multiplier is 1 and accum is 0', () => {
        then('swapped should be max uint', async () => {
          const _swapped = await calculateSwappedWith({
            accumRate: 0,
            rateMultiplier: 1,
            fee: 0,
          });
          expect(_swapped).to.equal(constants.MAX_UINT_256);
        });
      });

      when('multiplier is 0 and accum is MAX(uint256)', () => {
        then('swapped should be max uint', async () => {
          const swapped = await calculateSwappedWith({
            accumRate: constants.MAX_UINT_256,
            rateMultiplier: 0,
            fee: 0,
          });
          expect(swapped).to.equal(constants.MAX_UINT_256);
        });
      });

      when('multiplier is 2 and accum is -MAX(uint256)', () => {
        then('swapped should be max uint', async () => {
          const swapped = await calculateSwappedWith({
            accumRate: constants.MAX_UINT_256.mul(-1),
            rateMultiplier: 2,
            fee: 0,
          });
          expect(swapped).to.equal(constants.MAX_UINT_256);
        });
      });

      when('fee would overflow', () => {
        when('fee is smaller than precision', () => {
          then('looses the least amount of information', async () => {
            const feePrecision = await DCAFactory.FEE_PRECISION();
            const protocolFee = feePrecision - 1;
            const swapped = await calculateSwappedWith({
              accumRate: constants.MAX_UINT_256,
              rateMultiplier: 0,
              fee: protocolFee,
            });
            const fee = constants.MAX_UINT_256.div(feePrecision).mul(protocolFee).div(100);
            expect(swapped.add(fee)).to.equal(constants.MAX_UINT_256);
          });
        });

        when('precision is smaller than fee', () => {
          then('looses the least amount of information', async () => {
            const feePrecision = await DCAFactory.FEE_PRECISION();
            const protocolFee = feePrecision + 1;
            const swapped = await calculateSwappedWith({
              accumRate: constants.MAX_UINT_256,
              rateMultiplier: 0,
              fee: protocolFee,
            });
            const fee = constants.MAX_UINT_256.div(feePrecision).div(100).mul(protocolFee);
            expect(swapped.add(fee)).to.equal(constants.MAX_UINT_256);
          });
        });
      });
    });

    async function calculateSwappedWith({
      accumRate,
      rateMultiplier,
      fee,
    }: {
      accumRate: number | BigNumber;
      rateMultiplier: number;
      fee?: number | BigNumber;
    }) {
      const { dcaId } = await deposit(tokenA, 1, 1);
      if (fee !== undefined) await DCAFactory.setFee(fee);
      await DCAPositionHandler.setPerformedSwaps(PERFORMED_SWAPS_10 + 1);
      if (accumRate < 0) {
        await setRatePerUnit({
          accumRate: BigNumber.isBigNumber(accumRate) ? accumRate.abs() : fromEther(Math.abs(accumRate)),
          rateMultiplier: 0,
          onSwap: PERFORMED_SWAPS_10,
        });
        await setRatePerUnit({
          accumRate: 0,
          rateMultiplier,
          onSwap: PERFORMED_SWAPS_10 + 1,
        });
      } else {
        await setRatePerUnit({
          accumRate,
          rateMultiplier,
          onSwap: PERFORMED_SWAPS_10 + 1,
        });
      }

      return DCAPositionHandler.calculateSwapped(dcaId);
    }

    function expectCalculationToFailWithOverflow({
      accumRate,
      rateMultiplier,
      fee,
    }: {
      accumRate: number | BigNumber;
      rateMultiplier: number;
      fee?: number | BigNumber;
    }) {
      const tx = calculateSwappedWith({
        accumRate,
        rateMultiplier,
        fee,
      });

      return behaviours.checkTxRevertedWithMessage({
        tx,
        message: new RegExp("\\b(overflow|Transaction reverted and Hardhat couldn't infer the reason)\\b"),
      });
      // TODO: Remove hack above when Hardhat detects native overflows correctly
    }
  });

  async function setRatePerUnit({
    accumRate,
    rateMultiplier,
    onSwap,
  }: {
    accumRate: number | BigNumber;
    rateMultiplier: number;
    onSwap: number;
  }) {
    await DCAPositionHandler.setRatePerUnit(
      tokenA.address,
      onSwap,
      BigNumber.isBigNumber(accumRate) ? accumRate : fromEther(accumRate),
      rateMultiplier
    );
  }

  /**
   * Verify that approved addresses can also execute the action, but that other addresses can't
   */
  function erc721PermissionTest(execute: (contract: Contract, dcaId: BigNumber) => Promise<TransactionResponse>) {
    when(`executing address is approved for position`, () => {
      let dcaId: BigNumber;

      given(async () => {
        ({ dcaId } = await deposit(tokenA, POSITION_RATE_5, POSITION_SWAPS_TO_PERFORM_10));
        await DCAPositionHandler.approve(approved.address, dcaId);
      });

      then('they can execute the operation even if they are not the owner', async () => {
        const result: Promise<TransactionResponse> = execute(DCAPositionHandler.connect(approved), dcaId);
        await expect(result).to.not.be.reverted;
      });
    });

    when(`executing address is approved for all`, () => {
      let dcaId: BigNumber;

      given(async () => {
        ({ dcaId } = await deposit(tokenA, POSITION_RATE_5, POSITION_SWAPS_TO_PERFORM_10));
        await DCAPositionHandler.setApprovalForAll(approved.address, true);
      });

      then('they can execute the operation even if they are not the owner', async () => {
        const result: Promise<TransactionResponse> = execute(DCAPositionHandler.connect(approved), dcaId);
        await expect(result).to.not.be.reverted;
      });
    });

    when(`executing address isn't approved`, () => {
      let dcaId: BigNumber;

      given(async () => {
        ({ dcaId } = await deposit(tokenA, POSITION_RATE_5, POSITION_SWAPS_TO_PERFORM_10));
      });

      then('operation is reverted', async () => {
        const result: Promise<TransactionResponse> = execute(DCAPositionHandler.connect(stranger), dcaId);
        await expect(result).to.be.revertedWith('DCAPair: Caller not allowed');
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
    exec: (params: { dcaId: BigNumber; newRate: number; newSwaps: number }) => Promise<TransactionResponse>;
  }) {
    newRate = newRate ?? initialRate;
    newSwaps = newSwaps ?? initialSwaps;

    when(title, () => {
      let response: TransactionResponse;
      let dcaId: BigNumber;

      given(async () => {
        ({ dcaId } = await deposit(tokenA, initialRate, initialSwaps));

        await performTrade({
          swap: PERFORMED_SWAPS_10 + 1,
          ratePerUnit: RATE_PER_UNIT_5,
          amount: initialRate,
        });

        response = await exec({
          dcaId,
          newRate: newRate!,
          newSwaps: newSwaps!,
        });
      });

      then('event is emitted', async () => {
        await expect(response)
          .to.emit(DCAPositionHandler, 'Modified')
          .withArgs(owner.address, dcaId, fromEther(newRate!), PERFORMED_SWAPS_10 + 2, PERFORMED_SWAPS_10 + newSwaps! + 1);
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
        const expectedRateWithFee = await withFeeApplied(fromEther(RATE_PER_UNIT_5 * initialRate));
        await expectBalanceToBe(tokenB, DCAPositionHandler.address, expectedRateWithFee.add(fromEther(INITIAL_TOKEN_B_BALANCE_CONTRACT)));
      });

      then(`position is modified`, async () => {
        await expectPositionToBe(dcaId, {
          from: tokenA,
          rate: newRate!,
          lastWithdrawSwap: PERFORMED_SWAPS_10 + 1,
          lastSwap: PERFORMED_SWAPS_10 + newSwaps! + 1,
        });
      });

      then(`swapped amount isn't modified`, async () => {
        const swapped = await DCAPositionHandler.calculateSwapped(dcaId);
        const expected = await withFeeApplied(fromEther(initialRate * RATE_PER_UNIT_5)); // Only one swap was executed
        expect(swapped).to.equal(expected);
      });
    });
  }

  async function performTrade({
    swap,
    ratePerUnit,
    amount,
    fromToken,
  }: {
    swap: number;
    ratePerUnit: number;
    amount: number;
    fromToken?: Contract;
  }) {
    const fromTokenReal = fromToken ?? tokenA;
    const toToken = fromTokenReal === tokenA ? tokenB : tokenA;
    await DCAPositionHandler.setPerformedSwaps(swap);
    await DCAPositionHandler.setRatePerUnit(fromTokenReal.address, swap, fromEther(ratePerUnit), 0);
    await fromTokenReal.burn(DCAPositionHandler.address, fromEther(amount));
    await toToken.mint(DCAPositionHandler.address, await withFeeApplied(fromEther(amount * ratePerUnit))); // We calculate and subtract the fee, similarly to how it would be when not unit tested
  }

  function modifyRate(dcaId: BigNumber, rate: number): Promise<TransactionResponse> {
    return DCAPositionHandler.modifyRate(dcaId, fromEther(rate));
  }

  function modifySwaps(dcaId: BigNumber, swaps: number): Promise<TransactionResponse> {
    return DCAPositionHandler.modifySwaps(dcaId, swaps);
  }

  function modifyRateAndSwaps(dcaId: BigNumber, rate: number, swaps: number): Promise<TransactionResponse> {
    return DCAPositionHandler.modifyRateAndSwaps(dcaId, fromEther(rate), swaps);
  }

  function addFundsToPosition(dcaId: BigNumber, amount: number, swaps: number): Promise<TransactionResponse> {
    return DCAPositionHandler.addFundsToPosition(dcaId, fromEther(amount), swaps);
  }

  function withdrawSwapped(dcaId: BigNumber): Promise<TransactionResponse> {
    return DCAPositionHandler.withdrawSwapped(dcaId);
  }

  function withdrawSwappedMany(...dcaIds: BigNumber[]): Promise<TransactionResponse> {
    return DCAPositionHandler.withdrawSwappedMany(dcaIds);
  }

  function terminate(dcaId: BigNumber): Promise<TransactionResponse> {
    return DCAPositionHandler.terminate(dcaId);
  }

  async function deposit(token: Contract, rate: number, swaps: number) {
    const response: TransactionResponse = await DCAPositionHandler.deposit(token.address, fromEther(rate), swaps);
    const dcaId = await readArgFromEventOrFail<BigNumber>(response, 'Deposited', '_dcaId');
    return { response, dcaId };
  }

  async function expectBalanceToBe(token: Contract, address: string, asEther: BigNumber | string | number) {
    const balance = await token.balanceOf(address);
    expect(balance).to.be.equal(BigNumber.isBigNumber(asEther) ? asEther : fromEther(asEther));
  }

  async function expectPositionToBe(
    dcaId: BigNumber,
    {
      from,
      rate,
      lastSwap,
      lastWithdrawSwap,
    }: {
      from: Contract | string;
      rate: number;
      lastSwap: number;
      lastWithdrawSwap: number;
    }
  ) {
    const {
      fromTokenA,
      rate: positionRate,
      lastWithdrawSwap: positionLastWithdrawSwap,
      lastSwap: positionLastSwap,
    } = await DCAPositionHandler.userPositions(dcaId);
    const fromAddress = typeof from === 'string' ? from : from.address;
    expect(fromTokenA, 'Wrong from address in position').to.equal(tokenA.address === fromAddress);
    expect(positionRate, 'Wrong rate').to.equal(fromEther(rate));
    expect(positionLastWithdrawSwap, 'Wrong last withdraw swap').to.equal(lastWithdrawSwap);
    expect(positionLastSwap, 'Wrong last swap').to.equal(lastSwap);
  }

  async function getFeeFrom(value: BigNumberish): Promise<BigNumber> {
    value = BigNumber.from(value) as BigNumber;
    const feePrecision = await DCAFactory.FEE_PRECISION();
    const fee = await DCAFactory.fee();
    return value.mul(fee).div(feePrecision).div(100);
  }

  async function withFeeApplied(value: BigNumberish): Promise<BigNumber> {
    const applyFeeTo = BigNumber.from(value);
    const fee = await getFeeFrom(applyFeeTo);
    return applyFeeTo.sub(fee);
  }

  function fromEther(asEther: string | number): BigNumber {
    return utils.parseEther(`${asEther}`);
  }
});
