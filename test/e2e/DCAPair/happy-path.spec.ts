import moment from 'moment';
import { expect } from 'chai';
import { BigNumber, Contract, ContractFactory } from 'ethers';
import { ethers } from 'hardhat';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { constants, erc20, evm } from '../../utils';
import { contract } from '../../utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { TokenContract } from '../../utils/erc20';
import { readArgFromEventOrFail } from '../../utils/event-utils';

contract('DCAPair', () => {
  describe('Full e2e test', () => {
    const SWAP_INTERVAL_10_MINUTES = moment.duration(10, 'minutes').as('seconds');
    const SWAP_INTERVAL_1_HOUR = moment.duration(1, 'hour').as('seconds');
    const MAX_UINT_32 = BigNumber.from(2).pow(32).sub(1);

    let governor: SignerWithAddress, feeRecipient: SignerWithAddress, john: SignerWithAddress;
    let swapper1: SignerWithAddress;
    let lucy: SignerWithAddress, sarah: SignerWithAddress;
    let tokenA: TokenContract, tokenB: TokenContract;
    let DCAPairFactory: ContractFactory, DCAPair: Contract;
    let DCAGlobalParametersFactory: ContractFactory, DCAGlobalParameters: Contract;
    let timeWeightedOracleFactory: ContractFactory, timeWeightedOracle: Contract;
    let DCAPairSwapCalleeFactory: ContractFactory, DCAPairSwapCallee: Contract;
    let DCAPairLoanCalleeFactory: ContractFactory, DCAPairLoanCallee: Contract;

    // Global variables
    const swapFee1: number = 0.3;
    const swapRatio1: SwapRatio = { tokenA: 2, tokenB: 1 };

    before('Setup accounts and contracts', async () => {
      [governor, feeRecipient, swapper1, john, lucy, sarah] = await ethers.getSigners();
      DCAGlobalParametersFactory = await ethers.getContractFactory('contracts/DCAGlobalParameters/DCAGlobalParameters.sol:DCAGlobalParameters');
      DCAPairFactory = await ethers.getContractFactory('contracts/DCAPair/DCAPair.sol:DCAPair');
      timeWeightedOracleFactory = await ethers.getContractFactory('contracts/mocks/DCAPair/TimeWeightedOracleMock.sol:TimeWeightedOracleMock');
      DCAPairSwapCalleeFactory = await ethers.getContractFactory('contracts/mocks/DCAPairSwapCallee.sol:DCAPairSwapCalleeMock');
      DCAPairLoanCalleeFactory = await ethers.getContractFactory('contracts/mocks/DCAPairLoanCallee.sol:DCAPairLoanCalleeMock');
    });

    beforeEach('Deploy and configure', async () => {
      await evm.reset();
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

      timeWeightedOracle = await timeWeightedOracleFactory.deploy(0, 0);
      await setSwapRatio(swapRatio1);
      DCAGlobalParameters = await DCAGlobalParametersFactory.deploy(
        governor.address,
        governor.address,
        feeRecipient.address,
        constants.NOT_ZERO_ADDRESS,
        timeWeightedOracle.address
      );
      DCAPair = await DCAPairFactory.deploy(DCAGlobalParameters.address, tokenA.address, tokenB.address);
      await DCAGlobalParameters.addSwapIntervalsToAllowedList([SWAP_INTERVAL_10_MINUTES, SWAP_INTERVAL_1_HOUR], ['10 minutes', '1 hour']);
      DCAPairSwapCallee = await DCAPairSwapCalleeFactory.deploy(tokenA.asUnits(500), tokenB.asUnits(500));
      DCAPairLoanCallee = await DCAPairLoanCalleeFactory.deploy(tokenA.asUnits(20), tokenB.asUnits(20));

      await setInitialBalance(swapper1, { tokenA: 2000, tokenB: 2000 });
      await setInitialBalance(DCAPairSwapCallee, { tokenA: 500, tokenB: 500 });
      await setInitialBalance(DCAPairLoanCallee, { tokenA: 20, tokenB: 20 });
      await setSwapFee(swapFee1);
    });

    it('Execute happy path', async () => {
      await assertThereAreNoSwapsAvailable();

      const johnsPosition = await deposit({
        depositor: john,
        token: tokenA,
        swapInterval: SWAP_INTERVAL_10_MINUTES,
        rate: 100,
        swaps: 10,
      });

      await assertPositionIsConsistent(johnsPosition);
      await assertIntervalsToSwapNowAre(SWAP_INTERVAL_10_MINUTES);
      await assertPairBalanceDifferencesAre({ tokenA: +1000 });
      await assertAmountsToSwapAre({ tokenA: 100, tokenB: 0 });

      await swap({ swapper: swapper1 });

      await assertPositionIsConsistent(johnsPosition, { expectedSwapped: swapped({ rate: 100, ratio: swapRatio1, fee: swapFee1 }) });
      await assertNoSwapsCanBeExecutedNow();
      await assertPairBalanceDifferencesAre({ tokenA: -100, tokenB: +49.85 });
      await assertBalanceDifferencesAre(swapper1, { tokenA: +100, tokenB: -49.85 });
      await assertBalanceDifferencesAre(feeRecipient, { tokenA: 0, tokenB: 0 });

      const lucysPosition = await deposit({
        depositor: lucy,
        token: tokenB,
        swapInterval: SWAP_INTERVAL_1_HOUR,
        rate: 200,
        swaps: 2,
      });

      await assertPositionIsConsistent(lucysPosition);
      await assertIntervalsToSwapNowAre(SWAP_INTERVAL_1_HOUR);
      await assertAmountsToSwapAre({ tokenA: 0, tokenB: 200 });
      await assertPairBalanceDifferencesAre({ tokenB: +400 });

      await evm.advanceTimeAndBlock(SWAP_INTERVAL_10_MINUTES);

      await assertIntervalsToSwapNowAre(SWAP_INTERVAL_10_MINUTES, SWAP_INTERVAL_1_HOUR);
      await assertAmountsToSwapAre({ tokenA: 100, tokenB: 200 });

      const swapRatio2: SwapRatio = { tokenA: 1, tokenB: 1 };
      await setSwapRatio(swapRatio2);
      await swap({ swapper: swapper1 });

      await assertNoSwapsCanBeExecutedNow();
      await assertPositionIsConsistent(johnsPosition, {
        expectedSwapped: swapped({ rate: 100, ratio: swapRatio1, fee: swapFee1 }, { rate: 100, ratio: swapRatio2, fee: swapFee1 }),
      });
      await assertPositionIsConsistent(lucysPosition, { expectedSwapped: swapped({ rate: 200, ratio: swapRatio2, fee: swapFee1 }) });
      await assertPairBalanceDifferencesAre({ tokenA: +99.4, tokenB: -100.3 });
      await assertBalanceDifferencesAre(swapper1, { tokenA: -99.7, tokenB: +100 });
      await assertBalanceDifferencesAre(feeRecipient, { tokenA: +0.3, tokenB: +0.3 });

      const sarahsPosition1 = await deposit({
        depositor: sarah,
        token: tokenA,
        swapInterval: SWAP_INTERVAL_10_MINUTES,
        rate: 500,
        swaps: 3,
      });
      const sarahsPosition2 = await deposit({
        depositor: sarah,
        token: tokenB,
        swapInterval: SWAP_INTERVAL_10_MINUTES,
        rate: 100,
        swaps: 4,
      });

      await assertPositionIsConsistent(sarahsPosition1);
      await assertPositionIsConsistent(sarahsPosition2);
      await assertPairBalanceDifferencesAre({ tokenA: +1500, tokenB: +400 });

      await modifyRate(johnsPosition, 50);
      await assertPositionIsConsistent(johnsPosition, {
        expectedSwapped: swapped({ rate: 100, ratio: swapRatio1, fee: swapFee1 }, { rate: 100, ratio: swapRatio2, fee: swapFee1 }),
      });
      await assertPairBalanceDifferencesAre({ tokenA: -400 });
      await assertBalanceDifferencesAre(john, { tokenA: +400 });

      await evm.advanceTimeAndBlock(SWAP_INTERVAL_1_HOUR);

      await assertIntervalsToSwapNowAre(SWAP_INTERVAL_10_MINUTES, SWAP_INTERVAL_1_HOUR);
      await assertAmountsToSwapAre({ tokenA: 550, tokenB: 300 });

      await flashSwap({ callee: DCAPairSwapCallee });

      await assertNoSwapsCanBeExecutedNow();
      await assertPositionIsConsistent(johnsPosition, {
        expectedSwapped: swapped(
          { rate: 100, ratio: swapRatio1, fee: swapFee1 },
          { rate: 100, ratio: swapRatio2, fee: swapFee1 },
          { rate: 50, ratio: swapRatio2, fee: swapFee1 }
        ),
      });
      await assertPositionIsConsistent(lucysPosition, {
        expectedSwapped: swapped({ rate: 200, ratio: swapRatio2, fee: swapFee1 }, { rate: 200, ratio: swapRatio2, fee: swapFee1 }),
      });
      await assertPositionIsConsistent(sarahsPosition1, { expectedSwapped: swapped({ rate: 500, ratio: swapRatio2, fee: swapFee1 }) });
      await assertPositionIsConsistent(sarahsPosition2, { expectedSwapped: swapped({ rate: 100, ratio: swapRatio2, fee: swapFee1 }) });
      await assertPairBalanceDifferencesAre({ tokenA: -250.9, tokenB: +248.35 });
      await assertBalanceDifferencesAre(DCAPairSwapCallee, { tokenA: +250, tokenB: -249.25 });
      await assertBalanceDifferencesAre(feeRecipient, { tokenA: +0.9, tokenB: +0.9 });

      const availableForWithdraw = calculateSwapped(
        johnsPosition,
        { rate: 100, ratio: swapRatio1, fee: swapFee1 },
        { rate: 100, ratio: swapRatio2, fee: swapFee1 },
        { rate: 50, ratio: swapRatio2, fee: swapFee1 }
      );
      await withdraw(johnsPosition);

      await assertPositionIsConsistentWithNothingToWithdraw(johnsPosition);
      await assertPairBalanceDifferencesAre({ tokenB: availableForWithdraw.mul(-1) });
      await assertBalanceDifferencesAre(john, { tokenB: availableForWithdraw });

      await assertAvailableToBorrowIs({ tokenA: 1848.5, tokenB: 798.5 }); // Calculated by summing all balance differences
      await loan({ callee: DCAPairLoanCallee, tokenA: 1848.5, tokenB: 798.5 });

      await assertPairBalanceDifferencesAre({ tokenA: 0, tokenB: 0 });
      await assertBalanceDifferencesAre(feeRecipient, { tokenA: +1.8485, tokenB: +0.7985 });
      await assertBalanceDifferencesAre(DCAPairLoanCallee, { tokenA: -1.8485, tokenB: -0.7985 });

      await addFundsToPosition(johnsPosition, { newSwaps: 10, tokenA: 100 });

      await assertPositionIsConsistentWithNothingToWithdraw(johnsPosition);
      await assertPairBalanceDifferencesAre({ tokenA: +100 });
      await assertBalanceDifferencesAre(john, { tokenA: -100 });

      const swapFee2 = 0.2;
      const swapRatio3: SwapRatio = { tokenA: 1, tokenB: 2 };
      await setSwapFee(swapFee2);
      await setSwapRatio(swapRatio3);
      await evm.advanceTimeAndBlock(SWAP_INTERVAL_1_HOUR);

      await assertIntervalsToSwapNowAre(SWAP_INTERVAL_10_MINUTES, SWAP_INTERVAL_1_HOUR);
      await assertAmountsToSwapAre({ tokenA: 545, tokenB: 100 });

      await swap({ swapper: swapper1 });

      await assertNoSwapsCanBeExecutedNow();
      await assertPositionIsConsistent(johnsPosition, {
        expectedSwapped: swapped({ rate: 45, ratio: swapRatio3, fee: swapFee2 }),
      });
      await assertPositionIsConsistent(lucysPosition, {
        expectedSwapped: swapped({ rate: 200, ratio: swapRatio2, fee: swapFee1 }, { rate: 200, ratio: swapRatio2, fee: swapFee1 }),
      });
      await assertPositionIsConsistent(sarahsPosition1, {
        expectedSwapped: swapped({ rate: 500, ratio: swapRatio2, fee: swapFee1 }, { rate: 500, ratio: swapRatio3, fee: swapFee2 }),
      });
      await assertPositionIsConsistent(sarahsPosition2, {
        expectedSwapped: swapped({ rate: 100, ratio: swapRatio2, fee: swapFee1 }, { rate: 100, ratio: swapRatio3, fee: swapFee2 }),
      });
      await assertPairBalanceDifferencesAre({ tokenA: -495.1, tokenB: +987.82 });
      await assertBalanceDifferencesAre(swapper1, { tokenA: +495, tokenB: -988.02 });
      await assertBalanceDifferencesAre(feeRecipient, { tokenA: +0.1, tokenB: +0.2 });

      await evm.advanceTimeAndBlock(SWAP_INTERVAL_1_HOUR);
      await assertIntervalsToSwapNowAre(SWAP_INTERVAL_10_MINUTES); // Even after waiting an hour, the 1 hour interval is available. This is because it was marked as inactive on the last swap, since there were no more swaps on it

      await assertAmountsToSwapAre({ tokenA: 545, tokenB: 100 });

      await terminate(johnsPosition);

      await assertPairBalanceDifferencesAre({ tokenA: -405, tokenB: -89.82 });
      await assertBalanceDifferencesAre(john, { tokenA: +405, tokenB: +89.82 });
      await assertAmountsToSwapAre({ tokenA: 500, tokenB: 100 });

      await withdrawMany(sarahsPosition1, sarahsPosition2);

      await assertPairBalanceDifferencesAre({ tokenA: -149.6, tokenB: -1496.5 });
      await assertBalanceDifferencesAre(sarah, { tokenA: +149.6, tokenB: +1496.5 });

      await swap({ swapper: swapper1 });

      await assertNoSwapsCanBeExecutedNow();
      await assertPositionIsConsistent(lucysPosition, {
        expectedSwapped: swapped({ rate: 200, ratio: swapRatio2, fee: swapFee1 }, { rate: 200, ratio: swapRatio2, fee: swapFee1 }),
      });
      await assertPositionIsConsistent(sarahsPosition1, {
        expectedSwapped: swapped({ rate: 500, ratio: swapRatio3, fee: swapFee2 }),
      });
      await assertPositionIsConsistent(sarahsPosition2, {
        expectedSwapped: swapped({ rate: 100, ratio: swapRatio3, fee: swapFee2 }),
      });
      await assertPairBalanceDifferencesAre({ tokenA: -450.1, tokenB: +898 });
      await assertBalanceDifferencesAre(swapper1, { tokenA: +450, tokenB: -898.2 });
      await assertBalanceDifferencesAre(feeRecipient, { tokenA: +0.1, tokenB: +0.2 });

      await evm.advanceTimeAndBlock(SWAP_INTERVAL_10_MINUTES);
      await assertAmountsToSwapAre({ tokenA: 0, tokenB: 100 });
    });

    async function withdrawMany(position1: UserPositionDefinition, ...otherPositions: UserPositionDefinition[]) {
      await DCAPair.connect(position1.owner).withdrawSwappedMany([position1.id].concat(otherPositions.map(({ id }) => id)));

      // Since the position is "resetted" with a withdraw, we need to reduce the amount of swaps
      for (const position of [position1].concat(otherPositions)) {
        const { swapsLeft } = await getPosition(position);
        position.amountOfSwaps = BigNumber.from(swapsLeft);
      }
    }

    async function terminate(position: UserPositionDefinition) {
      await DCAPair.connect(position.owner).terminate(position.id);
    }

    async function setSwapFee(fee: number) {
      await DCAGlobalParameters.setSwapFee(fee * 10000);
    }

    async function addFundsToPosition(position: UserPositionDefinition, args: { newSwaps: number } & ({ tokenA: number } | { tokenB: number })) {
      let response: TransactionResponse;
      if (position.from.address === tokenA.address && 'tokenA' in args) {
        await tokenA.connect(position.owner).approve(DCAPair.address, tokenA.asUnits(args.tokenA).mul(args.newSwaps));
        response = await DCAPair.connect(position.owner).addFundsToPosition(position.id, tokenA.asUnits(args.tokenA), args.newSwaps);
      } else if (position.from.address === tokenB.address && 'tokenB' in args) {
        await tokenB.connect(position.owner).approve(DCAPair.address, tokenB.asUnits(args.tokenB).mul(args.newSwaps));
        response = await DCAPair.connect(position.owner).addFundsToPosition(position.id, tokenB.asUnits(args.tokenB), args.newSwaps);
      } else {
        throw new Error('WTF u doing man?');
      }
      position.amountOfSwaps = BigNumber.from(args.newSwaps);
      position.rate = await readArgFromEventOrFail<BigNumber>(response, 'Modified', '_rate');
    }

    async function setSwapRatio(ratio: SwapRatio) {
      await timeWeightedOracle.setRate(tokenA.asUnits(ratio.tokenA / ratio.tokenB), tokenB.amountOfDecimals);
    }

    async function withdraw(position: UserPositionDefinition): Promise<void> {
      await DCAPair.connect(position.owner).withdrawSwapped(position.id);

      // Since the position is "resetted" with a withdraw, we need to reduce the amount of swaps
      const { swapsLeft } = await getPosition(position);
      position.amountOfSwaps = BigNumber.from(swapsLeft);
    }

    async function swap({ swapper }: { swapper: SignerWithAddress }) {
      const nextSwapInfo = await getNextSwapInfo();
      const tokenToProvide = nextSwapInfo.tokenToBeProvidedBySwapper === tokenA.address ? tokenA : tokenB;
      await tokenToProvide.connect(swapper).transfer(DCAPair.address, nextSwapInfo.amountToBeProvidedBySwapper);
      await DCAPair.connect(swapper)['swap()']();
    }

    async function flashSwap({ callee }: { callee: HasAddress }) {
      await DCAPair['swap(uint256,uint256,address,bytes)'](0, 0, callee.address, ethers.utils.randomBytes(5));
    }

    async function loan({ callee, tokenA: amountTokenA, tokenB: amountTokenB }: { callee: HasAddress; tokenA: number; tokenB: number }) {
      await DCAPair.loan(tokenA.asUnits(amountTokenA), tokenB.asUnits(amountTokenB), callee.address, ethers.utils.randomBytes(5));
    }

    function getPosition(position: UserPositionDefinition): Promise<OngoingUserPosition> {
      return DCAPair.userPosition(position.id);
    }

    async function getNextSwapInfo(): Promise<NextSwapInformation> {
      const nextSwapInfo: NextSwapInformation & { amountOfSwaps: number } = await DCAPair.getNextSwapInfo();
      return {
        ...nextSwapInfo,
        // Remove zeroed positions in array
        swapsToPerform: nextSwapInfo.swapsToPerform.slice(0, nextSwapInfo.amountOfSwaps),
      };
    }

    async function modifyRate(position: UserPositionDefinition, rate: number): Promise<void> {
      const response = await DCAPair.connect(position.owner).modifyRate(position.id, position.from.asUnits(rate));
      const newRate = await readArgFromEventOrFail<BigNumber>(response, 'Modified', '_rate');
      const lastSwap = await readArgFromEventOrFail<number>(response, 'Modified', '_lastSwap');
      const startingSwap = await readArgFromEventOrFail<number>(response, 'Modified', '_startingSwap');
      position.rate = newRate;
      position.amountOfSwaps = BigNumber.from(lastSwap - startingSwap + 1);
    }

    async function deposit({
      token,
      depositor,
      rate,
      swapInterval,
      swaps,
    }: {
      token: TokenContract;
      depositor: SignerWithAddress;
      rate: number;
      swapInterval: number;
      swaps: number;
    }): Promise<UserPositionDefinition> {
      await token.mint(depositor.address, token.asUnits(rate).mul(swaps));
      await token.connect(depositor).approve(DCAPair.address, token.asUnits(rate).mul(swaps));
      const response: TransactionResponse = await DCAPair.connect(depositor).deposit(token.address, token.asUnits(rate), swaps, swapInterval);
      const positionId = await readArgFromEventOrFail<BigNumber>(response, 'Deposited', '_dcaId');
      return {
        id: positionId,
        owner: depositor,
        from: token,
        to: token.address === tokenA.address ? tokenB : tokenA,
        swapInterval: BigNumber.from(swapInterval),
        rate: token.asUnits(rate),
        amountOfSwaps: BigNumber.from(swaps),
      };
    }

    function calculateSwapped({ from, to }: UserPositionDefinition, ...swaps: { rate: number; ratio: SwapRatio; fee: number }[]) {
      return swaps
        .map(({ rate, ratio, fee }) => {
          const rateBN = from.asUnits(rate);
          const tempRatio = to.address === tokenB.address ? ratio.tokenB / ratio.tokenA : ratio.tokenA / ratio.tokenB;
          const swapped = tempRatio < 1 ? rateBN.div(1 / tempRatio) : rateBN.mul(tempRatio);
          const withCorrectDecimals = swapped.mul(to.magnitude).div(from.magnitude);
          return substractFee(fee, withCorrectDecimals);
        })
        .reduce(sumBN);
    }

    function swapped(...swaps: { rate: number; ratio: SwapRatio; fee: number }[]) {
      return (position: UserPositionDefinition) => calculateSwapped(position, ...swaps);
    }

    async function assertNoSwapsCanBeExecutedNow() {
      const secondsUntilNext = await DCAPair.secondsUntilNextSwap();
      expect(secondsUntilNext).to.be.greaterThan(0);
    }

    async function assertThereAreNoSwapsAvailable() {
      const secondsUntilNext = await DCAPair.secondsUntilNextSwap();
      expect(secondsUntilNext).to.equal(MAX_UINT_32);
      await assertIntervalsToSwapNowAre();
    }

    async function assertAmountsToSwapAre({ tokenA: expectedTokenA, tokenB: expectedTokenB }: { tokenA: number; tokenB: number }) {
      const { swapsToPerform } = await getNextSwapInfo();
      const totalTokenA = swapsToPerform.map(({ amountToSwapTokenA }) => amountToSwapTokenA).reduce(sumBN, constants.ZERO);
      const totalTokenB = swapsToPerform.map(({ amountToSwapTokenB }) => amountToSwapTokenB).reduce(sumBN, constants.ZERO);
      expect(totalTokenA).to.equal(tokenA.asUnits(expectedTokenA));
      expect(totalTokenB).to.equal(tokenB.asUnits(expectedTokenB));
    }

    async function assertIntervalsToSwapNowAre(...swapIntervals: number[]): Promise<void> {
      const nextSwapInfo = await getNextSwapInfo();
      const intervals = nextSwapInfo.swapsToPerform.map(({ interval }) => interval);
      expect(intervals).to.eql(swapIntervals);
      if (swapIntervals.length > 0) {
        const secondsUntilNext = await DCAPair.secondsUntilNextSwap();
        expect(secondsUntilNext).to.equal(0);
      }
    }

    function assertPositionIsConsistentWithNothingToWithdraw(position: UserPositionDefinition) {
      return assertPositionIsConsistent(position);
    }

    async function assertAvailableToBorrowIs({
      tokenA: amountTokenA,
      tokenB: amountTokenB,
    }: {
      tokenA: number | BigNumber;
      tokenB: number | BigNumber;
    }) {
      const [availableToBorrowA, availableToBorrowB] = await DCAPair.availableToBorrow();
      expect(availableToBorrowA).to.equal(BigNumber.isBigNumber(amountTokenA) ? amountTokenA : tokenA.asUnits(amountTokenA));
      expect(availableToBorrowB).to.equal(BigNumber.isBigNumber(amountTokenB) ? amountTokenB : tokenB.asUnits(amountTokenB));
    }

    async function assertPositionIsConsistent(
      position: UserPositionDefinition,
      options?: { expectedSwapped: (position: UserPositionDefinition) => BigNumber }
    ) {
      const { from, to, swapInterval, rate, swapsExecuted, swapsLeft, remaining, swapped } = await getPosition(position);
      expect(from).to.equal(position.from.address);
      expect(to).to.equal(position.to.address);
      expect(swapInterval).to.equal(position.swapInterval);
      expect(rate).to.equal(position.rate);
      expect(swapsExecuted + swapsLeft).to.equal(position.amountOfSwaps);
      expect(remaining).to.equal(rate.mul(swapsLeft));
      if (options) {
        const expectedSwapped = options.expectedSwapped(position);
        expect(swapped).to.equal(expectedSwapped);
      } else {
        expect(swapped).to.equal(constants.ZERO);
      }
    }

    async function assertPairBalanceDifferencesAre(
      args: { tokenA: number | BigNumber; tokenB?: number | BigNumber } | { tokenA?: number | BigNumber; tokenB: number | BigNumber }
    ) {
      const { expectedBalanceTokenA, expectedBalanceTokenB } = await assertBalanceDifferencesAre(DCAPair, args);
      await assertAvailableToBorrowIs({ tokenA: expectedBalanceTokenA, tokenB: expectedBalanceTokenB });
    }

    let lastBalanceTokenA: Map<string, BigNumber> = new Map();
    let lastBalanceTokenB: Map<string, BigNumber> = new Map();
    async function assertBalanceDifferencesAre(
      hasAddress: HasAddress,
      {
        tokenA: diffTokenA,
        tokenB: diffTokenB,
      }: { tokenA: number | BigNumber; tokenB?: number | BigNumber } | { tokenA?: number | BigNumber; tokenB: number | BigNumber }
    ) {
      const diffA = !diffTokenA ? 0 : BigNumber.isBigNumber(diffTokenA) ? diffTokenA : tokenA.asUnits(diffTokenA);
      const diffB = !diffTokenB ? 0 : BigNumber.isBigNumber(diffTokenB) ? diffTokenB : tokenB.asUnits(diffTokenB);
      const expectedBalanceTokenA = (lastBalanceTokenA.get(hasAddress.address) ?? constants.ZERO).add(diffA);
      const expectedBalanceTokenB = (lastBalanceTokenB.get(hasAddress.address) ?? constants.ZERO).add(diffB);
      expect(await tokenA.balanceOf(hasAddress.address)).to.equal(expectedBalanceTokenA);
      expect(await tokenB.balanceOf(hasAddress.address)).to.equal(expectedBalanceTokenB);
      lastBalanceTokenA.set(hasAddress.address, expectedBalanceTokenA);
      lastBalanceTokenB.set(hasAddress.address, expectedBalanceTokenB);
      return { expectedBalanceTokenA, expectedBalanceTokenB };
    }

    function substractFee(fee: number, number: BigNumber) {
      const percent = 100;
      return number.mul(percent * percent - fee * percent).div(percent * percent);
    }

    async function setInitialBalance(
      hasAddress: HasAddress,
      { tokenA: amountTokenA, tokenB: amountTokenB }: { tokenA: number; tokenB: number }
    ) {
      await tokenA.mint(hasAddress.address, tokenA.asUnits(amountTokenA));
      await tokenB.mint(hasAddress.address, tokenB.asUnits(amountTokenB));
      lastBalanceTokenA.set(hasAddress.address, tokenA.asUnits(amountTokenA));
      lastBalanceTokenB.set(hasAddress.address, tokenB.asUnits(amountTokenB));
    }

    const sumBN = (accum: BigNumber, newValue: BigNumber) => accum.add(newValue);

    type SwapRatio = { tokenA: 1; tokenB: number } | { tokenA: number; tokenB: 1 };

    type SwapInformation = {
      interval: number;
      swapToPerform: number;
      amountToSwapTokenA: BigNumber;
      amountToSwapTokenB: BigNumber;
    };

    type NextSwapInformation = {
      swapsToPerform: SwapInformation[];
      availableToBorrowTokenA: BigNumber;
      availableToBorrowTokenB: BigNumber;
      ratePerUnitBToA: BigNumber;
      ratePerUnitAToB: BigNumber;
      platformFeeTokenA: BigNumber;
      platformFeeTokenB: BigNumber;
      amountToBeProvidedBySwapper: BigNumber;
      amountToRewardSwapperWith: BigNumber;
      tokenToBeProvidedBySwapper: string;
      tokenToRewardSwapperWith: string;
    };

    type UserPositionDefinition = {
      id: BigNumber;
      owner: SignerWithAddress;
      from: TokenContract;
      to: TokenContract;
      swapInterval: BigNumber;
      rate: BigNumber;
      amountOfSwaps: BigNumber;
    };

    type OngoingUserPosition = {
      from: string;
      to: string;
      swapInterval: BigNumber;
      rate: BigNumber;
      swapsExecuted: number;
      swapped: BigNumber;
      swapsLeft: number;
      remaining: BigNumber;
    };

    type HasAddress = {
      readonly address: string;
    };
  });
});
