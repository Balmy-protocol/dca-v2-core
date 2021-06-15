import { BigNumber, BigNumberish, Contract, ContractFactory, utils } from 'ethers';
import { ethers } from 'hardhat';
import { erc20, behaviours, constants } from '../../utils';
import { expect } from 'chai';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { readArgFromEventOrFail } from '../../utils/event-utils';
import { when, then, given } from '../../utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';
import { TokenContract } from '../../utils/erc20';

// TODO: Test swap interval does not modify other intervals state
describe('DCAPositionHandler', () => {
  const PERFORMED_SWAPS_10 = 10;
  const POSITION_RATE_5 = 5;
  const POSITION_SWAPS_TO_PERFORM_10 = 10;
  const RATE_PER_UNIT_5 = 5;
  const SWAP_INTERVAL = 10;

  const INITIAL_TOKEN_A_BALANCE_CONTRACT = 100;
  const INITIAL_TOKEN_A_BALANCE_USER = 100;
  const INITIAL_TOKEN_B_BALANCE_CONTRACT = 100;
  const INITIAL_TOKEN_B_BALANCE_USER = 100;

  let owner: SignerWithAddress, approved: SignerWithAddress, stranger: SignerWithAddress;
  let tokenA: TokenContract, tokenB: TokenContract;
  let DCAPositionHandlerContract: ContractFactory;
  let DCAPositionHandler: Contract;
  let DCAGlobalParametersContract: ContractFactory;
  let DCAGlobalParameters: Contract;

  before('Setup accounts and contracts', async () => {
    [owner, approved, stranger] = await ethers.getSigners();
    DCAPositionHandlerContract = await ethers.getContractFactory(
      'contracts/mocks/DCAPair/DCAPairPositionHandler.sol:DCAPairPositionHandlerMock'
    );
    DCAGlobalParametersContract = await ethers.getContractFactory(
      'contracts/mocks/DCAGlobalParameters/DCAGlobalParameters.sol:DCAGlobalParametersMock'
    );
  });

  beforeEach('Deploy and configure', async () => {
    tokenA = await erc20.deploy({
      name: 'DAI',
      symbol: 'DAI',
      decimals: 12,
      initialAccount: owner.address,
      initialAmount: INITIAL_TOKEN_A_BALANCE_USER,
    });
    tokenB = await erc20.deploy({
      name: 'WBTC',
      symbol: 'WBTC',
      decimals: 16,
      initialAccount: owner.address,
      initialAmount: INITIAL_TOKEN_B_BALANCE_USER,
    });
    DCAGlobalParameters = await DCAGlobalParametersContract.deploy(owner.address, constants.NOT_ZERO_ADDRESS, constants.NOT_ZERO_ADDRESS);
    DCAPositionHandler = await DCAPositionHandlerContract.deploy(DCAGlobalParameters.address, tokenA.address, tokenB.address);
    await tokenA.approveInternal(owner.address, DCAPositionHandler.address, tokenA.asUnits(1000));
    await tokenB.approveInternal(owner.address, DCAPositionHandler.address, tokenB.asUnits(1000));
    await tokenA.mint(DCAPositionHandler.address, tokenA.asUnits(INITIAL_TOKEN_A_BALANCE_CONTRACT));
    await tokenB.mint(DCAPositionHandler.address, tokenB.asUnits(INITIAL_TOKEN_B_BALANCE_CONTRACT));
    await DCAPositionHandler.setInternalBalances(
      tokenA.asUnits(INITIAL_TOKEN_A_BALANCE_CONTRACT),
      tokenB.asUnits(INITIAL_TOKEN_B_BALANCE_CONTRACT)
    );
    await tokenA.mint(approved.address, tokenA.asUnits(INITIAL_TOKEN_A_BALANCE_USER));
    await tokenA.approveInternal(approved.address, DCAPositionHandler.address, tokenA.asUnits(1000));
    await DCAPositionHandler.setPerformedSwaps(SWAP_INTERVAL, PERFORMED_SWAPS_10);
    await DCAGlobalParameters.addSwapIntervalsToAllowedList([SWAP_INTERVAL], ['NULL']);
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
        args: [address, rate, swaps, SWAP_INTERVAL],
        message: error,
      });

    when('making a deposit with an unknown token address', () => {
      then('tx is reverted with message', async () => {
        await depositShouldRevert({
          address: constants.NOT_ZERO_ADDRESS,
          rate: POSITION_RATE_5,
          swaps: POSITION_SWAPS_TO_PERFORM_10,
          error: 'DCAPair: invalid deposit address',
        });
      });
    });

    when('making a deposit with non-allowed interval', async () => {
      given(async () => {
        await DCAGlobalParameters.removeSwapIntervalsFromAllowedList([SWAP_INTERVAL]);
      });
      then('tx is reverted with messasge', async () => {
        await depositShouldRevert({
          address: tokenA.address,
          rate: POSITION_RATE_5,
          swaps: POSITION_SWAPS_TO_PERFORM_10,
          error: 'DCAPair: interval not allowed',
        });
      });
    });

    when('making a deposit with 0 rate', () => {
      then('tx is reverted with message', async () => {
        await depositShouldRevert({
          address: tokenA.address,
          rate: 0,
          swaps: POSITION_SWAPS_TO_PERFORM_10,
          error: 'DCAPair: non-positive rate',
        });
      });
    });

    when('making a deposit with 0 swaps', () => {
      then('tx is reverted with message', async () => {
        await depositShouldRevert({
          address: tokenA.address,
          rate: POSITION_RATE_5,
          swaps: 0,
          error: 'DCAPair: non-positive amount',
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
          lastWithdrawSwap: PERFORMED_SWAPS_10,
          lastSwap: PERFORMED_SWAPS_10 + POSITION_SWAPS_TO_PERFORM_10,
        });
      });

      then('trade is recorded', async () => {
        const deltaPerformedSwaps = await DCAPositionHandler.swapAmountDelta(SWAP_INTERVAL, tokenA.address, PERFORMED_SWAPS_10);
        const deltaFirstDay = await DCAPositionHandler.swapAmountDelta(SWAP_INTERVAL, tokenA.address, PERFORMED_SWAPS_10 + 1);
        const deltaLastDay = await DCAPositionHandler.swapAmountDelta(
          SWAP_INTERVAL,
          tokenA.address,
          PERFORMED_SWAPS_10 + POSITION_SWAPS_TO_PERFORM_10
        );

        expect(deltaPerformedSwaps).to.equal(0);
        expect(deltaFirstDay).to.equal(tokenA.asUnits(POSITION_RATE_5));
        expect(deltaLastDay).to.equal(tokenA.asUnits(POSITION_RATE_5).mul(-1));
      });

      then('nft is created', async () => {
        const tokenOwner = await DCAPositionHandler.ownerOf(dcaId);
        const balance = await DCAPositionHandler.balanceOf(owner.address);
        expect(tokenOwner).to.equal(owner.address);
        expect(balance).to.equal(1);
      });

      thenInternalBalancesAreTheSameAsTokenBalances();
    });
  });

  describe('withdrawSwapped', () => {
    when('withdrawing swapped with invalid id', () => {
      then('tx is reverted with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAPositionHandler,
          func: 'withdrawSwapped',
          args: [100],
          message: 'DCAPair: invalid position id',
        });
      });
    });

    erc721PermissionTest(({ contract, dcaId }) => contract.withdrawSwapped(dcaId));

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

      thenInternalBalancesAreTheSameAsTokenBalances();
    });

    when(`withdrawing swapped with executed position`, () => {
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
        const swapped = tokenB.asUnits(RATE_PER_UNIT_5 * POSITION_RATE_5);
        const fee = await getFeeFrom(swapped);
        expect(await tokenB.balanceOf(owner.address)).to.equal(tokenB.asUnits(INITIAL_TOKEN_B_BALANCE_USER).add(swapped).sub(fee));
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
        const swapped = tokenB.asUnits(RATE_PER_UNIT_5 * POSITION_RATE_5);
        const swappedWithFeeApplied = await withFeeApplied(swapped);
        await expect(response).to.emit(DCAPositionHandler, 'Withdrew').withArgs(owner.address, dcaId, tokenB.address, swappedWithFeeApplied);
      });

      then('calculateSwapped returns 0', async () => {
        const swapped = await DCAPositionHandler.calculateSwapped(dcaId);
        expect(swapped).to.equal(0);
      });

      thenInternalBalancesAreTheSameAsTokenBalances();
    });
  });

  describe('withdrawSwappedMany', () => {
    when('withdrawing swapped with invalid id', () => {
      then('tx is reverted with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAPositionHandler,
          func: 'withdrawSwappedMany',
          args: [[100]],
          message: 'DCAPair: invalid position id',
        });
      });
    });

    erc721PermissionTest(({ contract, dcaId }) => contract.withdrawSwappedMany([dcaId]));

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

      thenInternalBalancesAreTheSameAsTokenBalances();
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
        const tradedFromBToA = tokenA.asUnits(RATE_PER_UNIT_5 * POSITION_RATE_3);
        const feeTradeFromBToA = await getFeeFrom(tradedFromBToA);
        const depositedToA = tokenA.asUnits(POSITION_RATE_5 * POSITION_SWAPS_TO_PERFORM_10);
        expect(await tokenA.balanceOf(owner.address)).to.equal(
          tokenA
            .asUnits(INITIAL_TOKEN_A_BALANCE_USER)
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
        const tradedFromAToB = tokenB.asUnits(RATE_PER_UNIT_5 * POSITION_RATE_5);
        const feeTradeFromAToB = await getFeeFrom(tradedFromAToB);
        const depositedToB = tokenB.asUnits(POSITION_RATE_3 * POSITION_SWAPS_TO_PERFORM_10);
        expect(await tokenB.balanceOf(owner.address)).to.equal(
          tokenB
            .asUnits(INITIAL_TOKEN_B_BALANCE_USER)
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
        const swappedA = tokenA.asUnits(RATE_PER_UNIT_5 * POSITION_RATE_3);
        const swappedB = tokenB.asUnits(RATE_PER_UNIT_5 * POSITION_RATE_5);
        await expect(response)
          .to.emit(DCAPositionHandler, 'WithdrewMany')
          .withArgs(owner.address, [dcaId1, dcaId2], await withFeeApplied(swappedA), await withFeeApplied(swappedB));
      });

      thenInternalBalancesAreTheSameAsTokenBalances();
    });
  });

  describe('terminate', () => {
    when('terminating a position with invalid id', () => {
      then('tx is reverted with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAPositionHandler,
          func: 'terminate',
          args: [100],
          message: 'DCAPair: invalid position id',
        });
      });
    });

    erc721PermissionTest(({ contract, dcaId }) => contract.terminate(dcaId));

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
          .withArgs(owner.address, dcaId, tokenA.asUnits(unswappedWhenTerminated), await withFeeApplied(tokenB.asUnits(swappedWhenTerminated)));
      });

      then('un-swapped balance is returned', async () => {
        await expectBalanceToBe(tokenA, owner.address, INITIAL_TOKEN_A_BALANCE_USER - POSITION_RATE_5);
        await expectBalanceToBe(tokenA, DCAPositionHandler.address, INITIAL_TOKEN_A_BALANCE_CONTRACT);
      });

      then('swapped balance is returned', async () => {
        const fee = await getFeeFrom(tokenB.asUnits(swappedWhenTerminated));

        const userBalance = await tokenB.balanceOf(owner.address);
        expect(userBalance).to.be.equal(tokenB.asUnits(INITIAL_TOKEN_B_BALANCE_USER + swappedWhenTerminated).sub(fee));

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
          message: 'DCAPair: invalid position id',
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
          message: 'DCAPair: non-positive rate',
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
          message: 'DCAPair: non-positive amount',
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
        await modifyRateAndSwaps(tokenA, dcaId, POSITION_RATE_6, POSITION_SWAPS_TO_PERFORM_10);

        // Execute second swap
        await performTrade({
          swap: PERFORMED_SWAPS_10 + 2,
          ratePerUnit: RATE_PER_UNIT_5 * 2,
          amount: POSITION_RATE_6,
        });

        // Modify the position once again
        await modifyRateAndSwaps(tokenA, dcaId, POSITION_RATE_7, POSITION_SWAPS_TO_PERFORM_10);

        // Execute final swap
        await performTrade({
          swap: PERFORMED_SWAPS_10 + 3,
          ratePerUnit: RATE_PER_UNIT_5 * 3,
          amount: POSITION_RATE_7,
        });

        const swapped = await DCAPositionHandler.calculateSwapped(dcaId);
        const amountSwapped = RATE_PER_UNIT_5 * (POSITION_RATE_5 + POSITION_RATE_6 + POSITION_RATE_7);
        const expected = await withFeeApplied(tokenB.asUnits(amountSwapped));
        expect(swapped).to.equal(expected);
      });
    });

    erc721PermissionTest(({ token, contract, dcaId }) => contract.modifyRateAndSwaps(dcaId, token.asUnits(9), 5));

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
          message: 'DCAPair: invalid position id',
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
          message: 'DCAPair: non-positive amount',
        });
      });
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
          message: 'DCAPair: invalid position id',
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
          message: 'DCAPair: non-positive amount',
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
          message: 'DCAPair: invalid position id',
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
          message: 'DCAPair: non-positive rate',
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
          message: 'DCAPair: position completed',
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
        await DCAPositionHandler.setPerformedSwaps(SWAP_INTERVAL, PERFORMED_SWAPS_10 + 1);
        await setRatePerUnit({
          accumRate: MAX.add(1),
          onSwap: PERFORMED_SWAPS_10 + 1,
        });

        tx = DCAPositionHandler.modifyPosition(dcaId, 1, 1, 1, 1);
      });

      then('tx is reverted', async () => {
        await behaviours.checkTxRevertedWithMessage({
          tx,
          message: 'DCAPair: must withdraw before',
        });
      });
    });

    when('the swapped amount just at the limit', () => {
      let dcaId: BigNumber;

      given(async () => {
        ({ dcaId } = await deposit(tokenA, 1, 1));
        await DCAPositionHandler.setPerformedSwaps(SWAP_INTERVAL, PERFORMED_SWAPS_10 + 1);
        await setRatePerUnit({
          accumRate: MAX,
          onSwap: PERFORMED_SWAPS_10 + 1,
        });

        await DCAPositionHandler.modifyPosition(dcaId, 1, 1, 1, 1);
      });

      then('position is modified correctly', async () => {
        const { swappedBeforeModified } = await DCAPositionHandler.userPosition(dcaId);
        expect(swappedBeforeModified).to.equal(MAX);
      });
    });
  });

  describe('calculateSwapped', () => {
    when('last swap ended before calculation', () => {
      then('swapped is calculated correctly', async () => {
        const { dcaId } = await deposit(tokenA, 1, 1);

        // Turn fees to zero
        await DCAGlobalParameters.setSwapFee(0);

        // Set a value in PERFORMED_SWAPS_10 + 1
        await setRatePerUnit({
          accumRate: 1000000,
          onSwap: PERFORMED_SWAPS_10 + 1,
        });

        // Set another value in PERFORMED_SWAPS_10 + 2
        await setRatePerUnit({
          accumRate: 1000001,
          onSwap: PERFORMED_SWAPS_10 + 2,
        });

        await DCAPositionHandler.setPerformedSwaps(SWAP_INTERVAL, PERFORMED_SWAPS_10 + 3);

        // It shouldn't revert, since the position ended before the overflow
        const swapped = await DCAPositionHandler.calculateSwapped(dcaId);
        expect(swapped).to.equal(tokenB.asUnits(1000000));
      });
    });

    describe('verify overflow errors', () => {
      when('accum is MAX(uint256) and position rate is more than 1', () => {
        then('there is an overflow', async () => {
          await expectCalculationToFailWithOverflow({
            accumRate: constants.MAX_UINT_256,
            positionRate: 2,
            fee: 0,
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
            fee: 0,
          });
          expect(swapped).to.equal(constants.MAX_UINT_256);
        });
      });

      when('fee would overflow', () => {
        when('fee is smaller than precision', () => {
          then('looses the least amount of information', async () => {
            const feePrecision = await DCAGlobalParameters.FEE_PRECISION();
            const protocolFee = feePrecision - 1;
            const swapped = await calculateSwappedWith({
              accumRate: constants.MAX_UINT_256,
              fee: protocolFee,
            });
            const fee = constants.MAX_UINT_256.div(feePrecision).mul(protocolFee).div(100);
            expect(swapped.add(fee)).to.equal(constants.MAX_UINT_256);
          });
        });

        when('precision is smaller than fee', () => {
          then('looses the least amount of information', async () => {
            const feePrecision = await DCAGlobalParameters.FEE_PRECISION();
            const protocolFee = feePrecision + 1;
            const swapped = await calculateSwappedWith({
              accumRate: constants.MAX_UINT_256,
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
      positionRate,
      fee,
    }: {
      accumRate: number | BigNumber;
      positionRate?: number;
      fee?: number | BigNumber;
    }) {
      const { dcaId } = await deposit(tokenA, positionRate ?? 1, 1);
      if (fee !== undefined) await DCAGlobalParameters.setSwapFee(fee);
      await DCAPositionHandler.setPerformedSwaps(SWAP_INTERVAL, PERFORMED_SWAPS_10 + 1);
      await setRatePerUnit({
        accumRate,
        onSwap: PERFORMED_SWAPS_10 + 1,
      });

      return DCAPositionHandler.calculateSwapped(dcaId);
    }

    function expectCalculationToFailWithOverflow({
      accumRate,
      positionRate,
      fee,
    }: {
      accumRate: number | BigNumber;
      positionRate: number;
      fee?: number | BigNumber;
    }) {
      const tx = calculateSwappedWith({
        accumRate,
        positionRate,
        fee,
      });

      return behaviours.checkTxRevertedWithMessage({
        tx,
        message: new RegExp("\\b(overflow|Transaction reverted and Hardhat couldn't infer the reason)\\b"),
      });
      // TODO: Remove hack above when Hardhat detects native overflows correctly
    }
  });

  async function setRatePerUnit({ accumRate, onSwap }: { accumRate: number | BigNumber; onSwap: number }) {
    await DCAPositionHandler.setRatePerUnit(
      SWAP_INTERVAL,
      tokenA.address,
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
        ({ dcaId } = await deposit(tokenA, POSITION_RATE_5, POSITION_SWAPS_TO_PERFORM_10));
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
        ({ dcaId } = await deposit(tokenA, POSITION_RATE_5, POSITION_SWAPS_TO_PERFORM_10));
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
        ({ dcaId } = await deposit(tokenA, POSITION_RATE_5, POSITION_SWAPS_TO_PERFORM_10));
      });

      then('operation is reverted', async () => {
        const result: Promise<TransactionResponse> = execute({ token: tokenA, contract: DCAPositionHandler.connect(stranger), dcaId });
        await expect(result).to.be.revertedWith('DCAPair: caller not allowed');
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
          token: tokenA,
          dcaId,
          newRate: newRate!,
          newSwaps: newSwaps!,
        });
      });

      then('event is emitted', async () => {
        await expect(response)
          .to.emit(DCAPositionHandler, 'Modified')
          .withArgs(owner.address, dcaId, tokenA.asUnits(newRate!), PERFORMED_SWAPS_10 + 2, PERFORMED_SWAPS_10 + newSwaps! + 1);
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
        const expectedRateWithFee = await withFeeApplied(tokenB.asUnits(RATE_PER_UNIT_5 * initialRate));
        await expectBalanceToBe(tokenB, DCAPositionHandler.address, expectedRateWithFee.add(tokenB.asUnits(INITIAL_TOKEN_B_BALANCE_CONTRACT)));
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
        const expected = await withFeeApplied(tokenB.asUnits(initialRate * RATE_PER_UNIT_5)); // Only one swap was executed
        expect(swapped).to.equal(expected);
      });

      thenInternalBalancesAreTheSameAsTokenBalances();
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
    fromToken?: TokenContract;
  }) {
    const fromTokenReal = fromToken ?? tokenA;
    const toToken = fromTokenReal === tokenA ? tokenB : tokenA;
    await DCAPositionHandler.setPerformedSwaps(SWAP_INTERVAL, swap);
    await DCAPositionHandler.setRatePerUnit(SWAP_INTERVAL, fromTokenReal.address, swap, toToken.asUnits(ratePerUnit));
    await fromTokenReal.burn(DCAPositionHandler.address, fromTokenReal.asUnits(amount));
    await toToken.mint(DCAPositionHandler.address, await withFeeApplied(toToken.asUnits(amount * ratePerUnit))); // We calculate and subtract the fee, similarly to how it would be when not unit tested
    await DCAPositionHandler.setInternalBalances(
      await tokenA.balanceOf(DCAPositionHandler.address),
      await tokenB.balanceOf(DCAPositionHandler.address)
    );
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

  function withdrawSwapped(dcaId: BigNumber): Promise<TransactionResponse> {
    return DCAPositionHandler.withdrawSwapped(dcaId);
  }

  function withdrawSwappedMany(...dcaIds: BigNumber[]): Promise<TransactionResponse> {
    return DCAPositionHandler.withdrawSwappedMany(dcaIds);
  }

  function terminate(dcaId: BigNumber): Promise<TransactionResponse> {
    return DCAPositionHandler.terminate(dcaId);
  }

  async function deposit(token: TokenContract, rate: number, swaps: number) {
    const response: TransactionResponse = await DCAPositionHandler.deposit(token.address, token.asUnits(rate), swaps, SWAP_INTERVAL);
    const dcaId = await readArgFromEventOrFail<BigNumber>(response, 'Deposited', '_dcaId');
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
    } = await DCAPositionHandler.userPosition(dcaId);
    const fromAddress = typeof from === 'string' ? from : from.address;
    expect(fromTokenA, 'Wrong from address in position').to.equal(tokenA.address === fromAddress);
    expect(positionRate, 'Wrong rate').to.equal(fromTokenA ? tokenA.asUnits(rate) : tokenB.asUnits(rate));
    expect(positionLastWithdrawSwap, 'Wrong last withdraw swap').to.equal(lastWithdrawSwap);
    expect(positionLastSwap, 'Wrong last swap').to.equal(lastSwap);
  }

  async function getFeeFrom(value: BigNumberish): Promise<BigNumber> {
    value = BigNumber.from(value) as BigNumber;
    const feePrecision = await DCAGlobalParameters.FEE_PRECISION();
    const fee = await DCAGlobalParameters.swapFee();
    return value.mul(fee).div(feePrecision).div(100);
  }

  async function withFeeApplied(value: BigNumberish): Promise<BigNumber> {
    const applyFeeTo = BigNumber.from(value);
    const fee = await getFeeFrom(applyFeeTo);
    return applyFeeTo.sub(fee);
  }
});
