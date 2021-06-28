import { BigNumber, Contract, ContractFactory } from 'ethers';
import { ethers } from 'hardhat';
import { erc20, behaviours, constants } from '../../../utils';
import { expect } from 'chai';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { readArgFromEventOrFail } from '../../../utils/event-utils';
import { when, then, given } from '../../../utils/bdd';
import { TokenContract } from '../../../utils/erc20';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';

describe('MAPPositionHandler', () => {
  const INITIAL_TOKEN_A_BALANCE_USER = 1;
  const INITIAL_TOKEN_B_BALANCE_USER = 100;
  const PAIR_ADDRESS = '0x0000000000000000000000000000000000000002';
  const INITIAL_PAIR_LIQUIDITY_A = 100;
  const INITIAL_PAIR_LIQUIDITY_B = 100;
  const INITIAL_SHARES_VALUE = 2;
  const TOKEN_RATIO = 100; // 1 tokenA = ${TOKEN_RATE} tokenB

  let owner: SignerWithAddress;
  let tokenA: TokenContract, tokenB: TokenContract;
  let MAPPositionHandlerContract: ContractFactory;
  let MAPPositionHandler: Contract;
  let positionRatioPrecision: BigNumber;
  let initialAmountOfShares: BigNumber;

  before('Setup accounts and contracts', async () => {
    [owner] = await ethers.getSigners();
    MAPPositionHandlerContract = await ethers.getContractFactory(
      'contracts/mocks/DCASubsidyPool/MultiAsymmetricPool/MAPPositionHandler.sol:MAPPositionHandlerMock'
    );
  });

  beforeEach('Deploy and configure', async () => {
    tokenA = await erc20.deploy({
      name: 'DAI',
      symbol: 'DAI',
      decimals: 18,
    });
    tokenB = await erc20.deploy({
      name: 'WBTC',
      symbol: 'WBTC',
      decimals: 18,
    });
    MAPPositionHandler = await MAPPositionHandlerContract.deploy();
    await tokenA.approveInternal(owner.address, MAPPositionHandler.address, constants.MAX_UINT_256);
    await tokenB.approveInternal(owner.address, MAPPositionHandler.address, constants.MAX_UINT_256);
    await tokenA.mint(owner.address, tokenA.asUnits(INITIAL_TOKEN_A_BALANCE_USER));
    await tokenB.mint(owner.address, tokenB.asUnits(INITIAL_TOKEN_B_BALANCE_USER));

    positionRatioPrecision = await MAPPositionHandler.POSITION_RATIO_PRECISION();
    await MAPPositionHandler.setPairData(PAIR_ADDRESS, tokenA.address, tokenB.address);
    await MAPPositionHandler.setRatio(TOKEN_RATIO);
    await MAPPositionHandler.setLiquidity(PAIR_ADDRESS, tokenA.asUnits(INITIAL_PAIR_LIQUIDITY_A), tokenB.asUnits(INITIAL_PAIR_LIQUIDITY_B));

    const initialLiquidity = tokenA.asUnits(INITIAL_PAIR_LIQUIDITY_A).mul(TOKEN_RATIO).add(tokenB.asUnits(INITIAL_PAIR_LIQUIDITY_B));
    initialAmountOfShares = initialLiquidity.div(INITIAL_SHARES_VALUE);
    await MAPPositionHandler.setTotalShares(PAIR_ADDRESS, initialAmountOfShares);
  });

  describe('deposit', () => {
    const depositShouldRevert = ({
      pair,
      tokenA: amountTokenA,
      tokenB: amountTokenB,
      error,
    }: {
      pair: string;
      tokenA: number;
      tokenB: number;
      error: string;
    }) =>
      behaviours.txShouldRevertWithMessage({
        contract: MAPPositionHandler,
        func: 'deposit',
        args: [pair, tokenA.asUnits(amountTokenA), tokenB.asUnits(amountTokenB)],
        message: error,
      });

    when('making a deposit with an unknown pair', () => {
      then('tx is reverted with message', async () => {
        await depositShouldRevert({
          pair: constants.NOT_ZERO_ADDRESS,
          tokenA: INITIAL_TOKEN_A_BALANCE_USER,
          tokenB: INITIAL_TOKEN_B_BALANCE_USER,
          error: 'MAP: Seems like the given pair does not exist',
        });
      });
    });

    when('making a deposit with no value', () => {
      then('tx is reverted with message', async () => {
        await depositShouldRevert({
          pair: PAIR_ADDRESS,
          tokenA: 0,
          tokenB: 0,
          error: 'MAP: Deposited liquidity must be positive',
        });
      });
    });

    when('making a valid deposit', async () => {
      let positionId: BigNumber;
      let tx: TransactionResponse;
      let depositedTokenA: BigNumber;
      let depositedTokenB: BigNumber;
      let depositedLiquidity: BigNumber;
      let shares: BigNumber;

      given(async () => {
        ({ tx, positionId } = await deposit(PAIR_ADDRESS, INITIAL_TOKEN_A_BALANCE_USER, INITIAL_TOKEN_B_BALANCE_USER));

        depositedTokenA = tokenA.asUnits(INITIAL_TOKEN_A_BALANCE_USER);
        depositedTokenB = tokenB.asUnits(INITIAL_TOKEN_B_BALANCE_USER);
        depositedLiquidity = getLiquidityWithRatio({
          amountTokenA: INITIAL_TOKEN_A_BALANCE_USER,
          amountTokenB: INITIAL_TOKEN_B_BALANCE_USER,
          ratio: TOKEN_RATIO,
        });
        const existingLiquidity = getLiquidityWithRatio({
          amountTokenA: INITIAL_PAIR_LIQUIDITY_A,
          amountTokenB: INITIAL_PAIR_LIQUIDITY_B,
          ratio: TOKEN_RATIO,
        });

        shares = depositedLiquidity.mul(initialAmountOfShares).div(existingLiquidity);
      });

      then('event is emitted correctly', async () => {
        await expect(tx)
          .to.emit(MAPPositionHandler, 'Deposited')
          .withArgs(owner.address, PAIR_ADDRESS, depositedTokenA, depositedTokenB, 1, shares);
      });

      then('total shares are increased for pair', async () => {
        const totalShares = await MAPPositionHandler.totalShares(PAIR_ADDRESS);
        expect(totalShares).to.equal(shares.add(initialAmountOfShares));
      });

      then('liquidity is increased for pair', async () => {
        const [amountTokenA, amountTokenB] = await MAPPositionHandler.liquidity(PAIR_ADDRESS);
        expect(amountTokenA).to.equal(depositedTokenA.add(tokenA.asUnits(INITIAL_PAIR_LIQUIDITY_A)));
        expect(amountTokenB).to.equal(depositedTokenB.add(tokenB.asUnits(INITIAL_PAIR_LIQUIDITY_B)));
      });

      then('correct amount is transferred from sender', async () => {
        await expectBalanceToBe(tokenA, owner.address, 0);
        await expectBalanceToBe(tokenB, owner.address, 0);
        await expectBalanceToBe(tokenA, MAPPositionHandler.address, INITIAL_TOKEN_A_BALANCE_USER);

        await expectBalanceToBe(tokenB, MAPPositionHandler.address, INITIAL_TOKEN_B_BALANCE_USER);
      });

      then('position is created', async () => {
        await expectPositionToBe(positionId, {
          shares: shares,
          ratioTokenB: depositedTokenB.mul(positionRatioPrecision).div(depositedLiquidity),
        });
      });
    });
  });

  describe('calculateOwned', () => {
    when(`when position doesn't exist`, async () => {
      then('tx is reverted with message', async () => {
        behaviours.txShouldRevertWithMessage({
          contract: MAPPositionHandler,
          func: 'calculateOwned',
          args: [1],
          message: 'MAP: Invalid position id',
        });
      });
    });

    when(`ratio doesn't change and no swaps were executed`, async () => {
      let positionId: BigNumber;
      let depositedTokenA: BigNumber;
      let depositedTokenB: BigNumber;

      given(async () => {
        ({ positionId } = await deposit(PAIR_ADDRESS, INITIAL_TOKEN_A_BALANCE_USER, INITIAL_TOKEN_B_BALANCE_USER));

        depositedTokenA = tokenA.asUnits(INITIAL_TOKEN_A_BALANCE_USER);
        depositedTokenB = tokenB.asUnits(INITIAL_TOKEN_B_BALANCE_USER);
      });

      then('owned is exactly as deposited', async () => {
        const [ownedTokenA, ownedTokenB] = await MAPPositionHandler.calculateOwned(positionId);
        expect(ownedTokenA).to.equal(depositedTokenA);
        expect(ownedTokenB).to.equal(depositedTokenB);
      });
    });

    // TODO: add some more tests for when the ratio changes. But first, we need to re-think the whole ratio deal when we understand better how to integrate with oracles
  });

  async function deposit(pairAddress: string, amountTokenA: number, amountTokenB: number) {
    const tx: TransactionResponse = await MAPPositionHandler.deposit(pairAddress, tokenA.asUnits(amountTokenA), tokenB.asUnits(amountTokenB));
    const positionId = await readArgFromEventOrFail<BigNumber>(tx, 'Deposited', '_positionId');
    const shares = await readArgFromEventOrFail<BigNumber>(tx, 'Deposited', '_shares');
    return { tx, positionId, shares };
  }

  function getLiquidityWithRatio({ amountTokenA, amountTokenB, ratio }: { amountTokenA: number; amountTokenB: number; ratio: number }) {
    return tokenA.asUnits(amountTokenA).mul(ratio).add(tokenB.asUnits(amountTokenB));
  }

  async function expectBalanceToBe(token: TokenContract, address: string, amount: string | number) {
    const balance = await token.balanceOf(address);
    expect(balance).to.be.equal(token.asUnits(amount));
  }

  async function expectPositionToBe(
    positionId: BigNumber,
    {
      shares: expectedShares,
      ratioTokenB: expectedRatioTokenB,
    }: {
      shares: BigNumber;
      ratioTokenB: BigNumber;
    }
  ) {
    const { pair, ratioB, shares } = await MAPPositionHandler.positions(positionId);
    expect(pair, 'Wrong pair').to.equal(PAIR_ADDRESS);
    expect(shares, 'Wrong position shares').to.equal(expectedShares);
    expect(ratioB, 'Wrong token B ratio').to.equal(expectedRatioTokenB);
  }
});
