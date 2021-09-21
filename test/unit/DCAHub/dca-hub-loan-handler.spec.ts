import { expect } from 'chai';
import { BigNumber, Contract, utils } from 'ethers';
import { ethers } from 'hardhat';
import { DCAHubLoanHandlerMock__factory, DCAHubLoanHandlerMock } from '@typechained';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { constants, erc20, behaviours, evm } from '@test-utils';
import { given, then, when } from '@test-utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { TokenContract } from '@test-utils/erc20';
import { snapshot } from '@test-utils/evm';
import { readArgFromEventOrFail } from '@test-utils/event-utils';

const WITH_FEE = (bn: BigNumber) => bn.add(CALCULATE_FEE(bn));
const CALCULATE_FEE = (bn: BigNumber) => bn.mul(1).div(1000);

describe('DCAHubLoanHandler', () => {
  let owner: SignerWithAddress;
  let tokenA: TokenContract, tokenB: TokenContract;
  let DCAHubLoanHandlerContract: DCAHubLoanHandlerMock__factory;
  let DCAHubLoanHandler: DCAHubLoanHandlerMock;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    [owner] = await ethers.getSigners();
    DCAHubLoanHandlerContract = await ethers.getContractFactory('contracts/mocks/DCAHub/DCAHubLoanHandler.sol:DCAHubLoanHandlerMock');
    tokenA = await erc20.deploy({
      name: 'tokenA',
      symbol: 'TKNA',
    });
    tokenB = await erc20.deploy({
      name: 'tokenB',
      symbol: 'TKNB',
    });
    DCAHubLoanHandler = await DCAHubLoanHandlerContract.deploy(owner.address, owner.address, constants.NOT_ZERO_ADDRESS);
    snapshotId = await snapshot.take();
  });

  beforeEach('Deploy and configure', async () => {
    await snapshot.revert(snapshotId);
  });

  describe('availableToBorrow', () => {
    let balanceTokenA: BigNumber, balanceTokenB: BigNumber;
    given(async () => {
      [balanceTokenA, balanceTokenB] = [tokenA.asUnits(10), tokenB.asUnits(100)];
      await DCAHubLoanHandler.setInternalBalance(tokenA.address, balanceTokenA);
      await DCAHubLoanHandler.setInternalBalance(tokenB.address, balanceTokenB);
    });

    when('checking how much is available to borrow', () => {
      then('the amounts are the internal balances', async () => {
        const [availableToBorrowA, availableToBorrowB] = await DCAHubLoanHandler.availableToBorrow([tokenA.address, tokenB.address]);
        expect(availableToBorrowA).to.equal(balanceTokenA);
        expect(availableToBorrowB).to.equal(balanceTokenB);
      });
    });
  });

  describe('flash loan', () => {
    const BYTES = ethers.utils.randomBytes(5);
    const [CALLEE_TOKEN_A_INITIAL_BALANCE, CALLEE_TOKEN_B_INITIAL_BALANCE] = [utils.parseEther('2'), utils.parseEther('2')];
    const [PAIR_TOKEN_A_INITIAL_BALANCE, PAIR_TOKEN_B_INITIAL_BALANCE] = [utils.parseEther('2'), utils.parseEther('2')];
    let DCAHubLoanCallee: Contract;

    given(async () => {
      const DCAHubLoanCalleeContract = await ethers.getContractFactory('contracts/mocks/DCAHubLoanCallee.sol:DCAHubLoanCalleeMock');
      DCAHubLoanCallee = await DCAHubLoanCalleeContract.deploy();
      await DCAHubLoanCallee.setInitialBalances(
        [tokenA.address, tokenB.address],
        [CALLEE_TOKEN_A_INITIAL_BALANCE, CALLEE_TOKEN_B_INITIAL_BALANCE]
      );
      await tokenA.mint(DCAHubLoanCallee.address, CALLEE_TOKEN_A_INITIAL_BALANCE);
      await tokenB.mint(DCAHubLoanCallee.address, CALLEE_TOKEN_B_INITIAL_BALANCE);
      await tokenA.mint(DCAHubLoanHandler.address, PAIR_TOKEN_A_INITIAL_BALANCE);
      await tokenB.mint(DCAHubLoanHandler.address, PAIR_TOKEN_B_INITIAL_BALANCE);
      await DCAHubLoanHandler.setInternalBalance(tokenA.address, PAIR_TOKEN_A_INITIAL_BALANCE);
      await DCAHubLoanHandler.setInternalBalance(tokenB.address, PAIR_TOKEN_B_INITIAL_BALANCE);
    });

    flashLoanFailedTest({
      title: 'flash loans are paused',
      context: () => DCAHubLoanHandler.pause(),
      amountToBorrowTokenA: () => PAIR_TOKEN_A_INITIAL_BALANCE,
      amountToBorrowTokenB: () => constants.ZERO,
      errorMessage: 'Pausable: paused',
    });

    flashLoanFailedTest({
      title: 'caller intends to borrow more than available in a',
      amountToBorrowTokenA: () => PAIR_TOKEN_A_INITIAL_BALANCE.add(1),
      amountToBorrowTokenB: () => PAIR_TOKEN_B_INITIAL_BALANCE,
      errorMessage: 'ERC20: transfer amount exceeds balance',
    });

    flashLoanFailedTest({
      title: 'caller intends to borrow more than available in b',
      amountToBorrowTokenA: () => PAIR_TOKEN_A_INITIAL_BALANCE,
      amountToBorrowTokenB: () => PAIR_TOKEN_B_INITIAL_BALANCE.add(1),
      errorMessage: 'ERC20: transfer amount exceeds balance',
    });

    flashLoanNotReturnedTest({
      title: 'returned token a is not enough',
      amountToBorrowTokenA: () => PAIR_TOKEN_A_INITIAL_BALANCE,
      amountToBorrowTokenB: () => PAIR_TOKEN_B_INITIAL_BALANCE,
      amountToReturnTokenA: () => WITH_FEE(PAIR_TOKEN_A_INITIAL_BALANCE).sub(1),
      amountToReturnTokenB: () => WITH_FEE(PAIR_TOKEN_B_INITIAL_BALANCE),
    });

    flashLoanNotReturnedTest({
      title: 'returned token b is not enough',
      amountToBorrowTokenA: () => PAIR_TOKEN_A_INITIAL_BALANCE,
      amountToBorrowTokenB: () => PAIR_TOKEN_B_INITIAL_BALANCE,
      amountToReturnTokenA: () => WITH_FEE(PAIR_TOKEN_A_INITIAL_BALANCE),
      amountToReturnTokenB: () => WITH_FEE(PAIR_TOKEN_B_INITIAL_BALANCE).sub(1),
    });

    when('flash loans are used', () => {
      const tokenAFee = CALCULATE_FEE(PAIR_TOKEN_A_INITIAL_BALANCE);
      const tokenBFee = CALCULATE_FEE(PAIR_TOKEN_B_INITIAL_BALANCE);
      let loan: { token: string; amount: BigNumber }[];
      let tx: TransactionResponse;

      given(async () => {
        loan = [
          { token: tokenA.address, amount: PAIR_TOKEN_A_INITIAL_BALANCE },
          { token: tokenB.address, amount: PAIR_TOKEN_B_INITIAL_BALANCE },
        ];
        tx = await DCAHubLoanHandler.loan(loan, DCAHubLoanCallee.address, BYTES);
      });

      then('callee is called', async () => {
        const { hub, sender, loan, loanFee, data } = await DCAHubLoanCallee.lastCall();
        expect(hub).to.equal(DCAHubLoanHandler.address);
        expect(sender).to.equal(owner.address);
        expect(loan).to.eql(loan);
        expect(loanFee).to.equal(1000);
        expect(data).to.equal(ethers.utils.hexlify(BYTES));
      });

      then('callee balance is modified correctly', async () => {
        const calleeTokenABalance = await tokenA.balanceOf(DCAHubLoanCallee.address);
        const calleeTokenBBalance = await tokenB.balanceOf(DCAHubLoanCallee.address);

        expect(calleeTokenABalance).to.equal(CALLEE_TOKEN_A_INITIAL_BALANCE.sub(tokenAFee));
        expect(calleeTokenBBalance).to.equal(CALLEE_TOKEN_B_INITIAL_BALANCE.sub(tokenBFee));
      });

      then(`hub's balance is increased correctly`, async () => {
        const hubTokenABalance = await tokenA.balanceOf(DCAHubLoanHandler.address);
        const hubTokenBBalance = await tokenB.balanceOf(DCAHubLoanHandler.address);

        expect(hubTokenABalance).to.equal(PAIR_TOKEN_A_INITIAL_BALANCE.add(tokenAFee));
        expect(hubTokenBBalance).to.equal(PAIR_TOKEN_B_INITIAL_BALANCE.add(tokenBFee));
      });

      then('extra tokens are considered as platform balance', async () => {
        const platformBalanceTokenA = await DCAHubLoanHandler.platformBalance(tokenA.address);
        const platformBalanceTokenB = await DCAHubLoanHandler.platformBalance(tokenB.address);

        expect(platformBalanceTokenA).to.equal(tokenAFee);
        expect(platformBalanceTokenB).to.equal(tokenBFee);
      });

      then('event is emitted', async () => {
        const sender = await readArgFromEventOrFail(tx, 'Loaned', 'sender');
        const to = await readArgFromEventOrFail(tx, 'Loaned', 'to');
        const emittedLoan: any = await readArgFromEventOrFail(tx, 'Loaned', 'loan');
        const fee = await readArgFromEventOrFail(tx, 'Loaned', 'fee');
        expect(sender).to.equal(owner.address);
        expect(to).to.equal(DCAHubLoanCallee.address);
        expect(fee).to.equal(1000);
        for (let i = 0; i < emittedLoan.length; i++) {
          expect(emittedLoan[i].token).to.equal(loan[i].token);
          expect(emittedLoan[i].amount).to.equal(loan[i].amount);
        }
      });

      thenInternalBalancesAreTheSameAsTokenBalances();
    });

    when('more tokens than expected are returned', () => {
      const tokenAFee = CALCULATE_FEE(PAIR_TOKEN_A_INITIAL_BALANCE);
      const tokenBFee = CALCULATE_FEE(PAIR_TOKEN_B_INITIAL_BALANCE);

      given(async () => {
        await DCAHubLoanCallee.returnSpecificAmounts(
          [tokenA.address, tokenB.address],
          [PAIR_TOKEN_A_INITIAL_BALANCE.add(tokenAFee).add(1), PAIR_TOKEN_B_INITIAL_BALANCE.add(tokenBFee).add(1)]
        );
        await DCAHubLoanHandler.loan(
          [
            { token: tokenA.address, amount: PAIR_TOKEN_A_INITIAL_BALANCE },
            { token: tokenB.address, amount: PAIR_TOKEN_B_INITIAL_BALANCE },
          ],
          DCAHubLoanCallee.address,
          BYTES
        );
      });

      then(`hub's balance is increased correctly`, async () => {
        const hubTokenABalance = await tokenA.balanceOf(DCAHubLoanHandler.address);
        const hubTokenBBalance = await tokenB.balanceOf(DCAHubLoanHandler.address);

        expect(hubTokenABalance).to.equal(PAIR_TOKEN_A_INITIAL_BALANCE.add(tokenAFee).add(1));
        expect(hubTokenBBalance).to.equal(PAIR_TOKEN_B_INITIAL_BALANCE.add(tokenBFee).add(1));
      });

      then('extra tokens are considered as platform balance', async () => {
        const platformBalanceTokenA = await DCAHubLoanHandler.platformBalance(tokenA.address);
        const platformBalanceTokenB = await DCAHubLoanHandler.platformBalance(tokenB.address);

        expect(platformBalanceTokenA).to.equal(tokenAFee.add(1));
        expect(platformBalanceTokenB).to.equal(tokenBFee.add(1));
      });

      thenInternalBalancesAreTheSameAsTokenBalances();
    });

    function flashLoanFailedTest({
      title,
      amountToBorrowTokenA,
      amountToBorrowTokenB,
      amountToReturnTokenA,
      amountToReturnTokenB,
      errorMessage,
      context,
    }: {
      title: string;
      context?: () => Promise<any>;
      amountToBorrowTokenA: () => BigNumber;
      amountToBorrowTokenB: () => BigNumber;
      amountToReturnTokenA?: () => BigNumber;
      amountToReturnTokenB?: () => BigNumber;
      errorMessage: string;
    }) {
      when(title, () => {
        let tx: Promise<TransactionResponse>;

        given(async () => {
          if (context) {
            await context();
          }
          if (amountToReturnTokenA && amountToReturnTokenB) {
            await DCAHubLoanCallee.returnSpecificAmounts([tokenA.address, tokenB.address], [amountToReturnTokenA(), amountToReturnTokenB()]);
          }
          tx = DCAHubLoanHandler.loan(
            [
              { token: tokenA.address, amount: amountToBorrowTokenA() },
              { token: tokenB.address, amount: amountToBorrowTokenB() },
            ],
            DCAHubLoanCallee.address,
            BYTES
          );
          await behaviours.waitForTxAndNotThrow(tx);
        });

        then('tx is reverted', async () => {
          await expect(tx).to.be.revertedWith(errorMessage);
        });
      });
    }

    function flashLoanNotReturnedTest(params: {
      title: string;
      amountToBorrowTokenA: () => BigNumber;
      amountToBorrowTokenB: () => BigNumber;
      amountToReturnTokenA: () => BigNumber;
      amountToReturnTokenB: () => BigNumber;
    }) {
      flashLoanFailedTest({
        ...params,
        errorMessage: 'LiquidityNotReturned',
      });
    }
  });

  function thenInternalBalancesAreTheSameAsTokenBalances() {
    then('internal balance for token A is as expected', async () => {
      const balance = await tokenA.balanceOf(DCAHubLoanHandler.address);
      const internalBalance = await DCAHubLoanHandler.internalBalanceOf(tokenA.address);
      expect(internalBalance).to.equal(balance);
    });

    then('internal balance for token B is as expected', async () => {
      const balance = await tokenB.balanceOf(DCAHubLoanHandler.address);
      const internalBalance = await DCAHubLoanHandler.internalBalanceOf(tokenB.address);
      expect(internalBalance).to.equal(balance);
    });
  }
});
