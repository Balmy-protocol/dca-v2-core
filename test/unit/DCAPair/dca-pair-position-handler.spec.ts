import moment from 'moment';
import {
  BigNumber,
  BigNumberish,
  Contract,
  ContractFactory,
  Signer,
  utils,
} from 'ethers';
import { ethers } from 'hardhat';
import { uniswap, erc20, behaviours, constants } from '../../utils';
import { expect } from 'chai';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import {
  expectNoEventWithName,
  readArgFromEvent,
  readArgFromEventOrFail,
} from '../../utils/chamo-utils';

import { Suite, SuiteFunction } from 'mocha';

const then = it;
const given = beforeEach;
const when: SuiteFunction = <SuiteFunction>(
  function (title: string, fn: (this: Suite) => void) {
    context('when ' + title, fn);
  }
);
when.only = (title: string, fn?: (this: Suite) => void) =>
  context.only('when ' + title, fn!);
when.skip = (title: string, fn: (this: Suite) => void) =>
  context.skip('when ' + title, fn);

describe('DCAPositionHandler', () => {
  const PERFORMED_SWAPS_10 = 10;
  const POSITION_RATE_5 = 5;
  const POSITION_SWAPS_TO_PERFORM_10 = 10;
  const RATE_PER_UNIT_5 = 5;

  const INITIAL_TOKEN_A_BALANCE_CONTRACT = 100;
  const INITIAL_TOKEN_A_BALANCE_USER = 100;
  const INITIAL_TOKEN_B_BALANCE_CONTRACT = 100;
  const INITIAL_TOKEN_B_BALANCE_USER = 100;

  let owner: Signer;
  let ownerAddress: string;
  let tokenA: Contract, tokenB: Contract;
  let DCAPositionHandlerContract: ContractFactory;
  let DCAPositionHandler: Contract;

  before('Setup accounts and contracts', async () => {
    [owner] = await ethers.getSigners();
    ownerAddress = await owner.getAddress();
    DCAPositionHandlerContract = await ethers.getContractFactory(
      'contracts/mocks/DCAPair/DCAPairPositionHandler.sol:DCAPairPositionHandlerMock'
    );
  });

  beforeEach('Deploy and configure', async () => {
    await uniswap.deploy({
      owner,
    });
    tokenA = await erc20.deploy({
      name: 'DAI',
      symbol: 'DAI',
      initialAccount: await owner.getAddress(),
      initialAmount: fromEther(INITIAL_TOKEN_A_BALANCE_USER),
    });
    tokenB = await erc20.deploy({
      name: 'WBTC',
      symbol: 'WBTC',
      initialAccount: await owner.getAddress(),
      initialAmount: fromEther(INITIAL_TOKEN_B_BALANCE_USER),
    });
    DCAPositionHandler = await DCAPositionHandlerContract.deploy(
      tokenA.address,
      tokenB.address,
      uniswap.getUniswapV2Router02().address,
      constants.NOT_ZERO_ADDRESS, // factory
      moment.duration(1, 'days').as('seconds')
    );
    await tokenA.approveInternal(
      ownerAddress,
      DCAPositionHandler.address,
      fromEther(1000)
    );
    await tokenA.mint(
      DCAPositionHandler.address,
      fromEther(INITIAL_TOKEN_A_BALANCE_CONTRACT)
    );
    await tokenB.mint(
      DCAPositionHandler.address,
      fromEther(INITIAL_TOKEN_B_BALANCE_CONTRACT)
    );
    await DCAPositionHandler.setPerformedSwaps(PERFORMED_SWAPS_10);
  });

  describe('deposit', () => {
    const depositShouldRevert = ({
      address,
      rate,
      swaps,
      error,
    }: {
      address: string;
      rate: number;
      swaps: number;
      error: string;
    }) =>
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
          error: 'DCAPair: Invalid rate. It must be positive',
        });
      });
    });

    when('making a deposit with 0 swaps', () => {
      then('tx is reverted with message', async () => {
        await depositShouldRevert({
          address: tokenA.address,
          rate: POSITION_RATE_5,
          swaps: 0,
          error: 'DCAPair: Invalid amount of swaps. It must be positive',
        });
      });
    });

    when('making a valid deposit', async () => {
      let dcaId: BigNumber;
      let tx: TransactionResponse;

      given(async () => {
        const depositTx = await deposit(
          tokenA,
          POSITION_RATE_5,
          POSITION_SWAPS_TO_PERFORM_10
        );
        tx = depositTx.response;
        dcaId = depositTx.dcaId;
      });

      then('event is emitted correctly', async () => {
        await expect(tx)
          .to.emit(DCAPositionHandler, 'Deposited')
          .withArgs(
            ownerAddress,
            1,
            tokenA.address,
            fromEther(POSITION_RATE_5),
            PERFORMED_SWAPS_10 + 1,
            PERFORMED_SWAPS_10 + POSITION_SWAPS_TO_PERFORM_10
          );
      });

      then('correct amount is transferred from sender', async () => {
        await expectBalanceToBe(
          tokenA,
          ownerAddress,
          INITIAL_TOKEN_A_BALANCE_USER -
            POSITION_RATE_5 * POSITION_SWAPS_TO_PERFORM_10
        );
        await expectBalanceToBe(
          tokenA,
          DCAPositionHandler.address,
          INITIAL_TOKEN_A_BALANCE_USER +
            POSITION_RATE_5 * POSITION_SWAPS_TO_PERFORM_10
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
        const deltaPerformedSwaps = await DCAPositionHandler.swapAmountDelta(
          tokenA.address,
          PERFORMED_SWAPS_10
        );
        const deltaFirstDay = await DCAPositionHandler.swapAmountDelta(
          tokenA.address,
          PERFORMED_SWAPS_10 + 1
        );
        const deltaLastDay = await DCAPositionHandler.swapAmountDelta(
          tokenA.address,
          PERFORMED_SWAPS_10 + POSITION_SWAPS_TO_PERFORM_10
        );

        expect(deltaPerformedSwaps).to.equal(0);
        expect(deltaFirstDay).to.equal(fromEther(POSITION_RATE_5));
        expect(deltaLastDay).to.equal(fromEther(POSITION_RATE_5).mul(-1));
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

    when(
      `withdrawing swapped with position that didn't have swaps executed`,
      () => {
        let response: TransactionResponse;
        let dcaId: BigNumber;

        given(async () => {
          ({ dcaId } = await deposit(
            tokenA,
            POSITION_RATE_5,
            POSITION_SWAPS_TO_PERFORM_10
          ));
          response = await withdrawSwapped(dcaId);
        });

        then('no event is emitted', async () => {
          await expectNoEventWithName(response, 'Withdrew');
        });

        then('no token transfer was made', async () => {
          await expectBalanceToBe(
            tokenA,
            ownerAddress,
            INITIAL_TOKEN_A_BALANCE_USER -
              POSITION_RATE_5 * POSITION_SWAPS_TO_PERFORM_10
          );
          await expectBalanceToBe(
            tokenA,
            DCAPositionHandler.address,
            INITIAL_TOKEN_A_BALANCE_CONTRACT +
              POSITION_RATE_5 * POSITION_SWAPS_TO_PERFORM_10
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
      }
    );

    when(`withdrawing swapped with executed position,`, () => {
      let response: TransactionResponse;
      let dcaId: BigNumber;

      given(async () => {
        ({ dcaId } = await deposit(
          tokenA,
          POSITION_RATE_5,
          POSITION_SWAPS_TO_PERFORM_10
        ));
        await performTrade({
          swap: PERFORMED_SWAPS_10 + 1,
          ratePerUnit: RATE_PER_UNIT_5,
          amount: POSITION_RATE_5,
        });
        response = await withdrawSwapped(dcaId);
      });

      then('swapped tokens are sent to the user', async () => {
        await expectBalanceToBe(
          tokenB,
          ownerAddress,
          INITIAL_TOKEN_B_BALANCE_USER + RATE_PER_UNIT_5 * POSITION_RATE_5
        );
        await expectBalanceToBe(
          tokenB,
          DCAPositionHandler.address,
          INITIAL_TOKEN_B_BALANCE_CONTRACT
        );
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
        await expect(response)
          .to.emit(DCAPositionHandler, 'Withdrew')
          .withArgs(
            ownerAddress,
            dcaId,
            tokenB.address,
            fromEther(RATE_PER_UNIT_5 * POSITION_RATE_5)
          );
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

    when(`terminating a valid position`, () => {
      const swappedWhenTerminated = RATE_PER_UNIT_5 * POSITION_RATE_5;
      const unswappedWhenTerminated =
        (POSITION_SWAPS_TO_PERFORM_10 - 1) * POSITION_RATE_5;

      let response: TransactionResponse;
      let dcaId: BigNumber;

      given(async () => {
        ({ dcaId } = await deposit(
          tokenA,
          POSITION_RATE_5,
          POSITION_SWAPS_TO_PERFORM_10
        ));

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
          .withArgs(
            ownerAddress,
            dcaId,
            fromEther(unswappedWhenTerminated),
            fromEther(swappedWhenTerminated)
          );
      });

      then('un-swapped balance is returned', async () => {
        await expectBalanceToBe(
          tokenA,
          ownerAddress,
          INITIAL_TOKEN_A_BALANCE_USER - POSITION_RATE_5
        );
        await expectBalanceToBe(
          tokenA,
          DCAPositionHandler.address,
          INITIAL_TOKEN_A_BALANCE_CONTRACT
        );
      });

      then('swapped balance is returned', async () => {
        await expectBalanceToBe(
          tokenB,
          ownerAddress,
          INITIAL_TOKEN_B_BALANCE_USER + swappedWhenTerminated
        );
        await expectBalanceToBe(
          tokenB,
          DCAPositionHandler.address,
          INITIAL_TOKEN_B_BALANCE_CONTRACT
        );
      });

      then(`position is removed`, async () => {
        await expectPositionToBe(dcaId, {
          from: constants.ZERO_ADDRESS,
          rate: 0,
          lastWithdrawSwap: 0,
          lastSwap: 0,
        });
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
        const { dcaId } = await deposit(
          tokenA,
          POSITION_RATE_5,
          POSITION_SWAPS_TO_PERFORM_10
        );

        await behaviours.txShouldRevertWithMessage({
          contract: DCAPositionHandler,
          func: 'modifyRateAndSwaps',
          args: [dcaId, 0, POSITION_SWAPS_TO_PERFORM_10],
          message: 'DCAPair: Invalid rate. It must be positive',
        });
      });
    });

    when('modifying a position with 0 swaps', () => {
      then('tx is reverted with message', async () => {
        const { dcaId } = await deposit(
          tokenA,
          POSITION_RATE_5,
          POSITION_SWAPS_TO_PERFORM_10
        );

        await behaviours.txShouldRevertWithMessage({
          contract: DCAPositionHandler,
          func: 'modifyRateAndSwaps',
          args: [dcaId, POSITION_RATE_5, 0],
          message: 'DCAPair: Invalid amount of swaps. It must be positive',
        });
      });
    });

    modifyPositionTest({
      title: `re-allocating deposited rate and swaps of a valid position`,
      initialRate: POSITION_RATE_5,
      initialSwaps: POSITION_SWAPS_TO_PERFORM_10,
      newRate: 9,
      newSwaps: 5,
      exec: ({ dcaId, newRate, newSwaps }) =>
        modifyRateAndSwaps(dcaId, newRate, newSwaps),
    });

    modifyPositionTest({
      title: `modifying a position so that it requires more funds`,
      initialRate: POSITION_RATE_5,
      initialSwaps: POSITION_SWAPS_TO_PERFORM_10,
      newRate: 11,
      newSwaps: 5,
      exec: ({ dcaId, newRate, newSwaps }) =>
        modifyRateAndSwaps(dcaId, newRate, newSwaps),
    });

    modifyPositionTest({
      title: `modifying a position so that it requires less funds`,
      initialRate: POSITION_RATE_5,
      initialSwaps: POSITION_SWAPS_TO_PERFORM_10,
      newRate: 7,
      newSwaps: 5,
      exec: ({ dcaId, newRate, newSwaps }) =>
        modifyRateAndSwaps(dcaId, newRate, newSwaps),
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
        const { dcaId } = await deposit(
          tokenA,
          POSITION_RATE_5,
          POSITION_SWAPS_TO_PERFORM_10
        );

        await behaviours.txShouldRevertWithMessage({
          contract: DCAPositionHandler,
          func: 'modifySwaps',
          args: [dcaId, 0],
          message: 'DCAPair: Invalid amount of swaps. It must be positive',
        });
      });
    });

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
        const { dcaId } = await deposit(
          tokenA,
          POSITION_RATE_5,
          POSITION_SWAPS_TO_PERFORM_10
        );

        await behaviours.txShouldRevertWithMessage({
          contract: DCAPositionHandler,
          func: 'modifyRate',
          args: [dcaId, 0],
          message: 'DCAPair: Invalid rate. It must be positive',
        });
      });
    });

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
          message:
            "DCAPair: You can't modify the rate of a position that has already been completed",
        });
      });
    });
  });

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
    exec: (params: {
      dcaId: BigNumber;
      newRate: number;
      newSwaps: number;
    }) => Promise<TransactionResponse>;
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
          .withArgs(
            ownerAddress,
            dcaId,
            fromEther(newRate!),
            PERFORMED_SWAPS_10 + 2,
            PERFORMED_SWAPS_10 + newSwaps! + 1
          );
      });

      then('final balances are as expected', async () => {
        await expectBalanceToBe(
          tokenA,
          ownerAddress,
          INITIAL_TOKEN_A_BALANCE_USER -
            initialRate * 1 - // Already executed trade
            newRate! * newSwaps! // New position
        );
        await expectBalanceToBe(
          tokenA,
          DCAPositionHandler.address,
          INITIAL_TOKEN_A_BALANCE_USER + newRate! * newSwaps!
        );
        await expectBalanceToBe(
          tokenB,
          ownerAddress,
          INITIAL_TOKEN_B_BALANCE_USER
        );
        await expectBalanceToBe(
          tokenB,
          DCAPositionHandler.address,
          INITIAL_TOKEN_B_BALANCE_CONTRACT + RATE_PER_UNIT_5 * initialRate
        );
      });

      then(`position is modified`, async () => {
        await expectPositionToBe(dcaId, {
          from: tokenA,
          rate: newRate!,
          lastWithdrawSwap: PERFORMED_SWAPS_10 + 1,
          lastSwap: PERFORMED_SWAPS_10 + newSwaps! + 1,
        });
      });
    });
  }

  async function performTrade({
    swap,
    ratePerUnit,
    amount,
  }: {
    swap: number;
    ratePerUnit: number;
    amount: number;
  }) {
    await DCAPositionHandler.setPerformedSwaps(swap);
    await DCAPositionHandler.addNewRatePerUnit(
      tokenA.address,
      swap,
      fromEther(ratePerUnit)
    );
    await tokenA.burn(DCAPositionHandler.address, fromEther(amount));
    await tokenB.mint(
      DCAPositionHandler.address,
      fromEther(amount * ratePerUnit)
    );
  }

  function modifyRate(
    dcaId: BigNumber,
    rate: number
  ): Promise<TransactionResponse> {
    return DCAPositionHandler.modifyRate(dcaId, fromEther(rate));
  }

  function modifySwaps(
    dcaId: BigNumber,
    swaps: number
  ): Promise<TransactionResponse> {
    return DCAPositionHandler.modifySwaps(dcaId, swaps);
  }

  function modifyRateAndSwaps(
    dcaId: BigNumber,
    rate: number,
    swaps: number
  ): Promise<TransactionResponse> {
    return DCAPositionHandler.modifyRateAndSwaps(dcaId, fromEther(rate), swaps);
  }

  function withdrawSwapped(dcaId: BigNumber): Promise<TransactionResponse> {
    return DCAPositionHandler.withdrawSwapped(dcaId);
  }

  function terminate(dcaId: BigNumber): Promise<TransactionResponse> {
    return DCAPositionHandler.terminate(dcaId);
  }

  async function deposit(token: Contract, rate: number, swaps: number) {
    const response: TransactionResponse = await DCAPositionHandler.deposit(
      token.address,
      fromEther(rate),
      swaps
    );
    const dcaId = await readArgFromEventOrFail<BigNumber>(
      response,
      'Deposited',
      '_dcaId'
    );
    return { response, dcaId };
  }

  async function expectBalanceToBe(
    token: Contract,
    address: string,
    asEther: string | number
  ) {
    const balance = await token.balanceOf(address);
    expect(balance).to.be.equal(fromEther(asEther));
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
      from: positionFromAddress,
      rate: positionRate,
      lastWithdrawSwap: positionLastWithdrawSwap,
      lastSwap: positionLastSwap,
    } = await DCAPositionHandler.userTrades(dcaId);
    const fromAddress = typeof from === 'string' ? from : from.address;
    expect(positionFromAddress, 'Wrong from address in position').to.equal(
      fromAddress
    );
    expect(positionRate, 'Wrong from rate').to.equal(fromEther(rate));
    expect(positionLastWithdrawSwap, 'Wrong last withdraw swap').to.equal(
      lastWithdrawSwap
    );
    expect(positionLastSwap, 'Wrong last swap').to.equal(lastSwap);
  }

  function fromEther(asEther: string | number): BigNumber {
    return utils.parseEther(`${asEther}`);
  }
});

/*

EXTRA
Verify that _calculateSwapped works correctly in cases where there was an overflow

*/
