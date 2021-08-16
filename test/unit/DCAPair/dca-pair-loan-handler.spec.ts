import { expect } from 'chai';
import { BigNumber, Contract, ContractFactory, utils } from 'ethers';
import { ethers } from 'hardhat';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { constants, erc20, behaviours, evm, bn } from '../../utils';
import { given, then, when } from '../../utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { TokenContract } from '../../utils/erc20';

const WITH_FEE = (bn: BigNumber) => bn.add(CALCULATE_FEE(bn));
const CALCULATE_FEE = (bn: BigNumber) => bn.mul(1).div(1000);

describe('DCAPairLoanHandler', () => {
  let owner: SignerWithAddress;
  let feeRecipient: SignerWithAddress;
  let tokenA: TokenContract, tokenB: TokenContract;
  let DCAPairLoanHandlerContract: ContractFactory;
  let DCAPairLoanHandler: Contract;
  let DCAGlobalParametersContract: ContractFactory;
  let DCAGlobalParameters: Contract;

  before('Setup accounts and contracts', async () => {
    [owner, feeRecipient] = await ethers.getSigners();
    DCAGlobalParametersContract = await ethers.getContractFactory(
      'contracts/mocks/DCAGlobalParameters/DCAGlobalParameters.sol:DCAGlobalParametersMock'
    );
    DCAPairLoanHandlerContract = await ethers.getContractFactory('contracts/mocks/DCAPair/DCAPairLoanHandler.sol:DCAPairLoanHandlerMock');
  });

  beforeEach('Deploy and configure', async () => {
    await evm.reset();
    tokenA = await erc20.deploy({
      name: 'tokenA',
      symbol: 'TKNA',
    });
    tokenB = await erc20.deploy({
      name: 'tokenB',
      symbol: 'TKNB',
    });
    DCAGlobalParameters = await DCAGlobalParametersContract.deploy(
      owner.address,
      owner.address,
      feeRecipient.address,
      constants.NOT_ZERO_ADDRESS,
      constants.NOT_ZERO_ADDRESS
    );
    DCAPairLoanHandler = await DCAPairLoanHandlerContract.deploy(tokenA.address, tokenB.address, DCAGlobalParameters.address);
  });

  describe('availableToBorrow', () => {
    let balanceTokenA: BigNumber, balanceTokenB: BigNumber;
    given(async () => {
      [balanceTokenA, balanceTokenB] = [tokenA.asUnits(10), tokenB.asUnits(100)];
      await DCAPairLoanHandler.setInternalBalances(balanceTokenA, balanceTokenB);
    });

    when('checking how much is available to borrow', () => {
      then('the amounts are the internal balances', async () => {
        const [availableToBorrowA, availableToBorrowB] = await DCAPairLoanHandler.availableToBorrow();
        expect(availableToBorrowA).to.equal(balanceTokenA);
        expect(availableToBorrowB).to.equal(balanceTokenB);
      });
    });
  });

  describe('flash loan', () => {
    const BYTES = ethers.utils.randomBytes(5);
    const [CALLEE_TOKEN_A_INITIAL_BALANCE, CALLEE_TOKEN_B_INITIAL_BALANCE] = [utils.parseEther('2'), utils.parseEther('2')];
    const [PAIR_TOKEN_A_INITIAL_BALANCE, PAIR_TOKEN_B_INITIAL_BALANCE] = [utils.parseEther('2'), utils.parseEther('2')];
    let DCAPairLoanCallee: Contract;

    given(async () => {
      const DCAPairLoanCalleeContract = await ethers.getContractFactory('contracts/mocks/DCAPairLoanCallee.sol:DCAPairLoanCalleeMock');
      DCAPairLoanCallee = await DCAPairLoanCalleeContract.deploy(CALLEE_TOKEN_A_INITIAL_BALANCE, CALLEE_TOKEN_B_INITIAL_BALANCE);
      await tokenA.mint(DCAPairLoanCallee.address, CALLEE_TOKEN_A_INITIAL_BALANCE);
      await tokenB.mint(DCAPairLoanCallee.address, CALLEE_TOKEN_B_INITIAL_BALANCE);
      await tokenA.mint(DCAPairLoanHandler.address, PAIR_TOKEN_A_INITIAL_BALANCE);
      await tokenB.mint(DCAPairLoanHandler.address, PAIR_TOKEN_B_INITIAL_BALANCE);
      await DCAPairLoanHandler.setInternalBalances(PAIR_TOKEN_A_INITIAL_BALANCE, PAIR_TOKEN_B_INITIAL_BALANCE);
    });

    flashLoanFailedTest({
      title: 'no amount is borrowed',
      amountToBorrowTokenA: () => constants.ZERO,
      amountToBorrowTokenB: () => constants.ZERO,
      errorMessage: 'ZeroLoan',
    });

    flashLoanFailedTest({
      title: 'flash loans are paused',
      context: () => DCAGlobalParameters.pause(),
      amountToBorrowTokenA: () => PAIR_TOKEN_A_INITIAL_BALANCE,
      amountToBorrowTokenB: () => constants.ZERO,
      errorMessage: 'Paused',
    });

    flashLoanFailedTest({
      title: 'caller intends to borrow more than available in a',
      amountToBorrowTokenA: () => PAIR_TOKEN_A_INITIAL_BALANCE.add(1),
      amountToBorrowTokenB: () => PAIR_TOKEN_B_INITIAL_BALANCE,
      errorMessage: 'InsufficientLiquidity',
    });

    flashLoanFailedTest({
      title: 'caller intends to borrow more than available in b',
      amountToBorrowTokenA: () => PAIR_TOKEN_A_INITIAL_BALANCE,
      amountToBorrowTokenB: () => PAIR_TOKEN_B_INITIAL_BALANCE.add(1),
      errorMessage: 'InsufficientLiquidity',
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

    when('doing a reentrant attack with loan', () => {
      let tx: Promise<TransactionResponse>;
      given(async () => {
        const reentrantDCAPairLoanCalleFactory = await ethers.getContractFactory(
          'contracts/mocks/DCAPairLoanCallee.sol:ReentrantDCAPairLoanCalleeMock'
        );
        const reentrantDCAPairSwapCallee = await reentrantDCAPairLoanCalleFactory.deploy();
        await reentrantDCAPairSwapCallee.setAttack(
          (
            await DCAPairLoanHandler.populateTransaction.loan(
              PAIR_TOKEN_A_INITIAL_BALANCE,
              PAIR_TOKEN_B_INITIAL_BALANCE,
              reentrantDCAPairSwapCallee.address,
              BYTES
            )
          ).data
        );
        tx = DCAPairLoanHandler['loan(uint256,uint256,address,bytes)'](
          PAIR_TOKEN_A_INITIAL_BALANCE,
          PAIR_TOKEN_B_INITIAL_BALANCE,
          reentrantDCAPairSwapCallee.address,
          BYTES
        );
      });
      then('tx is reverted', async () => {
        await expect(tx).to.be.revertedWith('ReentrancyGuard: reentrant call');
      });
    });

    when('flash loans are used', () => {
      const tokenAFee = CALCULATE_FEE(PAIR_TOKEN_A_INITIAL_BALANCE);
      const tokenBFee = CALCULATE_FEE(PAIR_TOKEN_B_INITIAL_BALANCE);
      let tx: TransactionResponse;

      given(async () => {
        tx = await DCAPairLoanHandler['loan(uint256,uint256,address,bytes)'](
          PAIR_TOKEN_A_INITIAL_BALANCE,
          PAIR_TOKEN_B_INITIAL_BALANCE,
          DCAPairLoanCallee.address,
          BYTES
        );
      });

      then('callee is called', async () => {
        const {
          pair,
          sender,
          tokenA: tokenAParam,
          tokenB: tokenBParam,
          amountBorrowedTokenA,
          amountBorrowedTokenB,
          feeTokenA,
          feeTokenB,
          data,
        } = await DCAPairLoanCallee.getLastCall();
        expect(pair).to.equal(DCAPairLoanHandler.address);
        expect(sender).to.equal(owner.address);
        expect(tokenAParam).to.equal(tokenA.address);
        expect(tokenBParam).to.equal(tokenB.address);
        expect(amountBorrowedTokenA).to.equal(PAIR_TOKEN_A_INITIAL_BALANCE);
        expect(amountBorrowedTokenB).to.equal(PAIR_TOKEN_B_INITIAL_BALANCE);
        expect(feeTokenA).to.equal(tokenAFee);
        expect(feeTokenB).to.equal(tokenBFee);
        expect(data).to.equal(ethers.utils.hexlify(BYTES));
      });

      then('callee balance is modified correctly', async () => {
        const calleeTokenABalance = await tokenA.balanceOf(DCAPairLoanCallee.address);
        const calleeTokenBBalance = await tokenB.balanceOf(DCAPairLoanCallee.address);

        expect(calleeTokenABalance).to.equal(CALLEE_TOKEN_A_INITIAL_BALANCE.sub(tokenAFee));
        expect(calleeTokenBBalance).to.equal(CALLEE_TOKEN_B_INITIAL_BALANCE.sub(tokenBFee));
      });

      then('pair balance stays the same', async () => {
        const pairTokenABalance = await tokenA.balanceOf(DCAPairLoanHandler.address);
        const pairTokenBBalance = await tokenB.balanceOf(DCAPairLoanHandler.address);

        expect(pairTokenABalance).to.equal(PAIR_TOKEN_A_INITIAL_BALANCE);
        expect(pairTokenBBalance).to.equal(PAIR_TOKEN_B_INITIAL_BALANCE);
      });

      then('fee recipient balance is modified correctly', async () => {
        const feeRecipientTokenABalance = await tokenA.balanceOf(feeRecipient.address);
        const feeRecipientTokenBBalance = await tokenB.balanceOf(feeRecipient.address);

        expect(feeRecipientTokenABalance).to.equal(tokenAFee);
        expect(feeRecipientTokenBBalance).to.equal(tokenBFee);
      });

      then('event is emitted', async () => {
        await expect(tx)
          .to.emit(DCAPairLoanHandler, 'Loaned')
          .withArgs(owner.address, DCAPairLoanCallee.address, PAIR_TOKEN_A_INITIAL_BALANCE, PAIR_TOKEN_B_INITIAL_BALANCE, 1000);
      });

      thenInternalBalancesAreTheSameAsTokenBalances();
    });

    when('more tokens than expected are returned', () => {
      const tokenAFee = CALCULATE_FEE(PAIR_TOKEN_A_INITIAL_BALANCE);
      const tokenBFee = CALCULATE_FEE(PAIR_TOKEN_B_INITIAL_BALANCE);
      let tx: TransactionResponse;

      given(async () => {
        await DCAPairLoanCallee.returnSpecificAmounts(
          PAIR_TOKEN_A_INITIAL_BALANCE.add(tokenAFee).add(1),
          PAIR_TOKEN_B_INITIAL_BALANCE.add(tokenBFee).add(1)
        );
        tx = await DCAPairLoanHandler['loan(uint256,uint256,address,bytes)'](
          PAIR_TOKEN_A_INITIAL_BALANCE,
          PAIR_TOKEN_B_INITIAL_BALANCE,
          DCAPairLoanCallee.address,
          BYTES
        );
      });

      then('pair balance stays the same', async () => {
        const pairTokenABalance = await tokenA.balanceOf(DCAPairLoanHandler.address);
        const pairTokenBBalance = await tokenB.balanceOf(DCAPairLoanHandler.address);

        expect(pairTokenABalance).to.equal(PAIR_TOKEN_A_INITIAL_BALANCE);
        expect(pairTokenBBalance).to.equal(PAIR_TOKEN_B_INITIAL_BALANCE);
      });

      then('extra tokens are sent to fee recipient', async () => {
        const feeRecipientTokenABalance = await tokenA.balanceOf(feeRecipient.address);
        const feeRecipientTokenBBalance = await tokenB.balanceOf(feeRecipient.address);

        expect(feeRecipientTokenABalance).to.equal(tokenAFee.add(1));
        expect(feeRecipientTokenBBalance).to.equal(tokenBFee.add(1));
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
      context?: () => Promise<void>;
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
            await DCAPairLoanCallee.returnSpecificAmounts(amountToReturnTokenA(), amountToReturnTokenB());
          }
          tx = DCAPairLoanHandler['loan(uint256,uint256,address,bytes)'](
            amountToBorrowTokenA(),
            amountToBorrowTokenB(),
            DCAPairLoanCallee.address,
            BYTES
          );
          await behaviours.waitForTxAndNotThrow(tx);
        });

        then('tx is reverted', async () => {
          await expect(tx).to.be.revertedWith(errorMessage);
        });

        then('callee state is not modified', async () => {
          const wasCalled = await DCAPairLoanCallee.wasThereACall();
          expect(wasCalled).to.be.false;
        });

        then('callee balance is not modified', async () => {
          const calleeTokenABalance = await tokenA.balanceOf(DCAPairLoanCallee.address);
          const calleeTokenBBalance = await tokenB.balanceOf(DCAPairLoanCallee.address);

          expect(calleeTokenABalance).to.equal(CALLEE_TOKEN_A_INITIAL_BALANCE);
          expect(calleeTokenBBalance).to.equal(CALLEE_TOKEN_B_INITIAL_BALANCE);
        });

        then('pair balance is not modified', async () => {
          const pairTokenABalance = await tokenA.balanceOf(DCAPairLoanHandler.address);
          const pairTokenBBalance = await tokenB.balanceOf(DCAPairLoanHandler.address);

          expect(pairTokenABalance).to.equal(PAIR_TOKEN_A_INITIAL_BALANCE);
          expect(pairTokenBBalance).to.equal(PAIR_TOKEN_B_INITIAL_BALANCE);
        });

        thenInternalBalancesAreTheSameAsTokenBalances();
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
      const balance = await tokenA.balanceOf(DCAPairLoanHandler.address);
      const internalBalance = await DCAPairLoanHandler.internalBalanceOf(tokenA.address);
      expect(internalBalance).to.equal(balance);
    });

    then('internal balance for token B is as expected', async () => {
      const balance = await tokenB.balanceOf(DCAPairLoanHandler.address);
      const internalBalance = await DCAPairLoanHandler.internalBalanceOf(tokenB.address);
      expect(internalBalance).to.equal(balance);
    });
  }
});
