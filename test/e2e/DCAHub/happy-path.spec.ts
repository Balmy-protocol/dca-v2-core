import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';
import {
  DCAHub,
  DCAHub__factory,
  DCAHubSwapCalleeMock,
  DCAHubSwapCalleeMock__factory,
  DCAHubLoanCalleeMock,
  DCAHubLoanCalleeMock__factory,
  DCAPermissionsManager,
  DCAPermissionsManager__factory,
  IPriceOracle,
} from '@typechained';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { constants, erc20, evm } from '@test-utils';
import { contract } from '@test-utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { TokenContract } from '@test-utils/erc20';
import { readArgFromEventOrFail } from '@test-utils/event-utils';
import { buildGetNextSwapInfoInput, buildSwapInput } from 'js-lib/swap-utils';
import { SwapInterval } from 'js-lib/interval-utils';
import { FakeContract, smock } from '@defi-wonderland/smock';
import { Permission } from 'js-lib/types';

contract('DCAHub', () => {
  describe('Full e2e test', () => {
    let governor: SignerWithAddress, john: SignerWithAddress;
    let lucy: SignerWithAddress, sarah: SignerWithAddress;
    let joe: SignerWithAddress, larry: SignerWithAddress;
    let tokenA: TokenContract, tokenB: TokenContract, tokenC: TokenContract;
    let DCAHubFactory: DCAHub__factory, DCAHub: DCAHub;
    let priceOracle: FakeContract<IPriceOracle>;
    let DCAHubSwapCalleeFactory: DCAHubSwapCalleeMock__factory, DCAHubSwapCallee: DCAHubSwapCalleeMock;
    let DCAHubLoanCalleeFactory: DCAHubLoanCalleeMock__factory, DCAHubLoanCallee: DCAHubLoanCalleeMock;
    let DCAPermissionsManagerFactory: DCAPermissionsManager__factory, DCAPermissionsManager: DCAPermissionsManager;

    // Global variables
    const swapFee1: number = 0.3;

    before('Setup accounts and contracts', async () => {
      [governor, john, lucy, sarah, joe, larry] = await ethers.getSigners();
      DCAHubFactory = await ethers.getContractFactory('contracts/DCAHub/DCAHub.sol:DCAHub');
      DCAHubSwapCalleeFactory = await ethers.getContractFactory('contracts/mocks/DCAHubSwapCallee.sol:DCAHubSwapCalleeMock');
      DCAHubLoanCalleeFactory = await ethers.getContractFactory('contracts/mocks/DCAHubLoanCallee.sol:DCAHubLoanCalleeMock');
      DCAPermissionsManagerFactory = await ethers.getContractFactory(
        'contracts/DCAPermissionsManager/DCAPermissionsManager.sol:DCAPermissionsManager'
      );
    });

    beforeEach('Deploy and configure', async () => {
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
      tokenC = await erc20.deploy({
        name: 'tokenC',
        symbol: 'TKNC',
        decimals: 18,
      });

      priceOracle = await smock.fake('IPriceOracle');
      DCAPermissionsManager = await DCAPermissionsManagerFactory.deploy(constants.NOT_ZERO_ADDRESS, constants.NOT_ZERO_ADDRESS);

      DCAHub = await DCAHubFactory.deploy(governor.address, governor.address, priceOracle.address, DCAPermissionsManager.address);
      await DCAPermissionsManager.setHub(DCAHub.address);
      await DCAHub.addSwapIntervalsToAllowedList([SwapInterval.FIFTEEN_MINUTES.seconds, SwapInterval.ONE_HOUR.seconds]);
      await DCAHub.setPlatformFeeRatio(5000);
      DCAHubSwapCallee = await DCAHubSwapCalleeFactory.deploy();
      await DCAHubSwapCallee.setInitialBalances(
        [tokenA.address, tokenB.address, tokenC.address],
        [tokenA.asUnits(2500), tokenB.asUnits(2500), tokenC.asUnits(2500)]
      );

      DCAHubLoanCallee = await DCAHubLoanCalleeFactory.deploy();
      await DCAHubLoanCallee.setInitialBalances([tokenA.address, tokenB.address], [tokenA.asUnits(20), tokenB.asUnits(20)]);

      await setInitialBalance(DCAHubSwapCallee, { tokenA: 2500, tokenB: 2500, tokenC: 2500 });
      await setInitialBalance(DCAHubLoanCallee, { tokenA: 20, tokenB: 20, tokenC: 0 });
      await setSwapFee(swapFee1);
    });

    it('Execute happy path', async () => {
      const swapRatioAB1: SwapRatio = { token0: tokenA, token1: tokenB, ratio: { token0: 2, token1: 1 } };
      const swapRatioAC1: SwapRatio = { token0: tokenA, token1: tokenC, ratio: { token0: 1, token1: 1 } };
      const swapRatioBC1: SwapRatio = { token0: tokenB, token1: tokenC, ratio: { token0: 1, token1: 2 } };
      setSwapRatio(swapRatioAB1);
      setSwapRatio(swapRatioAC1);
      setSwapRatio(swapRatioBC1);

      await assertNoSwapsCanBeExecutedNow();

      const johnsPosition = await deposit({
        owner: john,
        from: tokenA,
        to: tokenB,
        swapInterval: SwapInterval.FIFTEEN_MINUTES,
        rate: 100,
        swaps: 10,
      });

      const joesPosition = await deposit({
        owner: joe,
        from: tokenC,
        to: tokenA,
        swapInterval: SwapInterval.FIFTEEN_MINUTES,
        rate: 50,
        swaps: 4,
        permissions: [{ operator: larry, permissions: [Permission.WITHDRAW, Permission.TERMINATE] }],
      });

      await assertPositionIsConsistentWithNoSwappedBalance(joesPosition);
      await assertPositionIsConsistentWithNoSwappedBalance(johnsPosition);
      await assertIntervalsToSwapNowAre(SwapInterval.FIFTEEN_MINUTES);
      await assertHubBalanceDifferencesAre({ tokenA: +1000, tokenC: +200 });
      await assertAmountsToSwapAre({ tokenA: 100, tokenB: 0, tokenC: 50 });

      await flashSwap({ callee: DCAHubSwapCallee });

      await assertPositionIsConsistent(johnsPosition, { expectedSwapped: swapped({ rate: 100, ratio: swapRatioAB1, fee: swapFee1 }) });
      await assertPositionIsConsistent(joesPosition, { expectedSwapped: swapped({ rate: 50, ratio: swapRatioAC1, fee: swapFee1 }) });
      await assertNoSwapsCanBeExecutedNow();
      await assertSwapOutcomeWas({ tokens: { tokenA: -50, tokenB: +50, tokenC: -50 }, totalFees: { tokenA: 0.15, tokenB: 0.15 } });

      const lucysPosition = await deposit({
        owner: lucy,
        from: tokenB,
        to: tokenA,
        swapInterval: SwapInterval.ONE_HOUR,
        rate: 200,
        swaps: 2,
      });

      await assertPositionIsConsistentWithNoSwappedBalance(lucysPosition);
      await assertNoSwapsCanBeExecutedNow(); // Even though the 1h interval could be swapped, it will wait for the 15m interval
      await assertHubBalanceDifferencesAre({ tokenB: +400 });

      await evm.advanceTimeAndBlock(SwapInterval.FIFTEEN_MINUTES.seconds);

      await assertIntervalsToSwapNowAre(SwapInterval.FIFTEEN_MINUTES, SwapInterval.ONE_HOUR);
      await assertAmountsToSwapAre({ tokenA: 100, tokenB: 200, tokenC: 50 });

      const swapRatioAB2: SwapRatio = { token0: tokenA, token1: tokenB, ratio: { token0: 1, token1: 1 } };
      setSwapRatio(swapRatioAB2);
      await flashSwap({ callee: DCAHubSwapCallee });

      await assertNoSwapsCanBeExecutedNow();
      await assertPositionIsConsistent(johnsPosition, {
        expectedSwapped: swapped({ rate: 100, ratio: swapRatioAB1, fee: swapFee1 }, { rate: 100, ratio: swapRatioAB2, fee: swapFee1 }),
      });
      await assertPositionIsConsistent(joesPosition, {
        expectedSwapped: swapped({ rate: 50, ratio: swapRatioAC1, fee: swapFee1 }, { rate: 50, ratio: swapRatioAC1, fee: swapFee1 }),
      });
      await assertPositionIsConsistent(lucysPosition, { expectedSwapped: swapped({ rate: 200, ratio: swapRatioAB2, fee: swapFee1 }) });
      await assertSwapOutcomeWas({ tokens: { tokenA: +150, tokenB: -100, tokenC: -50 }, totalFees: { tokenA: 0.75, tokenB: 0.3 } });

      const sarahsPosition1 = await deposit({
        owner: sarah,
        from: tokenA,
        to: tokenB,
        swapInterval: SwapInterval.FIFTEEN_MINUTES,
        rate: 500,
        swaps: 3,
      });
      const sarahsPosition2 = await deposit({
        owner: sarah,
        from: tokenB,
        to: tokenA,
        swapInterval: SwapInterval.FIFTEEN_MINUTES,
        rate: 100,
        swaps: 4,
      });

      await assertPositionIsConsistentWithNoSwappedBalance(sarahsPosition1);
      await assertPositionIsConsistentWithNoSwappedBalance(sarahsPosition2);
      await assertHubBalanceDifferencesAre({ tokenA: +1500, tokenB: +400 });

      await reducePosition(johnsPosition, { amount: 400, newSwaps: 8 });
      await assertPositionIsConsistent(johnsPosition, {
        expectedSwapped: swapped({ rate: 100, ratio: swapRatioAB1, fee: swapFee1 }, { rate: 100, ratio: swapRatioAB2, fee: swapFee1 }),
      });
      await assertHubBalanceDifferencesAre({ tokenA: -400 });
      await assertBalanceDifferencesAre(john, { tokenA: +400 });

      await withdraw(joesPosition, { caller: larry, recipient: larry });
      await assertHubBalanceDifferencesAre({ tokenA: -99.7 });
      await assertBalanceDifferencesAre(larry, { tokenA: +99.7 });
      await assertPositionIsConsistentWithNoSwappedBalance(joesPosition);

      const larrysPosition = await deposit({
        owner: larry,
        from: tokenB,
        to: tokenC,
        swapInterval: SwapInterval.FIFTEEN_MINUTES,
        rate: 100,
        swaps: 2,
      });

      await assertPositionIsConsistentWithNoSwappedBalance(larrysPosition);
      await assertHubBalanceDifferencesAre({ tokenB: +200 });

      await evm.advanceTimeAndBlock(SwapInterval.ONE_HOUR.seconds);

      await assertIntervalsToSwapNowAre(SwapInterval.FIFTEEN_MINUTES, SwapInterval.ONE_HOUR);
      await assertAmountsToSwapAre({ tokenA: 550, tokenB: 400, tokenC: 50 });

      await flashSwap({ callee: DCAHubSwapCallee });

      await assertNoSwapsCanBeExecutedNow();
      await assertPositionIsConsistent(johnsPosition, {
        expectedSwapped: swapped(
          { rate: 100, ratio: swapRatioAB1, fee: swapFee1 },
          { rate: 100, ratio: swapRatioAB2, fee: swapFee1 },
          { rate: 50, ratio: swapRatioAB2, fee: swapFee1 }
        ),
      });
      await assertPositionIsConsistent(joesPosition, { expectedSwapped: swapped({ rate: 50, ratio: swapRatioAC1, fee: swapFee1 }) });
      await assertPositionIsConsistent(lucysPosition, {
        expectedSwapped: swapped({ rate: 200, ratio: swapRatioAB2, fee: swapFee1 }, { rate: 200, ratio: swapRatioAB2, fee: swapFee1 }),
      });
      await assertPositionIsConsistent(sarahsPosition1, { expectedSwapped: swapped({ rate: 500, ratio: swapRatioAB2, fee: swapFee1 }) });
      await assertPositionIsConsistent(sarahsPosition2, { expectedSwapped: swapped({ rate: 100, ratio: swapRatioAB2, fee: swapFee1 }) });
      await assertPositionIsConsistent(larrysPosition, { expectedSwapped: swapped({ rate: 100, ratio: swapRatioBC1, fee: swapFee1 }) });
      await assertSwapOutcomeWas({
        tokens: { tokenA: -200, tokenB: +150, tokenC: +150 },
        totalFees: { tokenA: 1.05, tokenB: 1.65, tokenC: 0.6 },
      });

      const availableForWithdraw = calculateSwapped(
        johnsPosition,
        { rate: 100, ratio: swapRatioAB1, fee: swapFee1 },
        { rate: 100, ratio: swapRatioAB2, fee: swapFee1 },
        { rate: 50, ratio: swapRatioAB2, fee: swapFee1 }
      );
      await withdraw(johnsPosition);

      await assertPositionIsConsistentWithNoSwappedBalance(johnsPosition);
      await assertHubBalanceDifferencesAre({ tokenB: availableForWithdraw.mul(-1) });
      await assertBalanceDifferencesAre(john, { tokenB: availableForWithdraw });

      await terminate(joesPosition, { caller: larry, recipient: larry });
      await assertHubBalanceDifferencesAre({ tokenA: -49.85, tokenC: -50 });
      await assertBalanceDifferencesAre(larry, { tokenA: +49.85, tokenC: +50 });
      await assertPositionIsTerminated(joesPosition);

      const [balanceTokenA, balanceTokenB] = [await tokenA.balanceOf(DCAHub.address), await tokenB.balanceOf(DCAHub.address)];
      await loan({ callee: DCAHubLoanCallee, tokenA: balanceTokenA, tokenB: balanceTokenB });

      const [loanFeeTokenA, loanFeeTokenB] = [balanceTokenA.div(10000), balanceTokenB.div(10000)];
      await assertHubBalanceDifferencesAre({ tokenA: loanFeeTokenA, tokenB: loanFeeTokenB });
      await assertPlatformBalanceIncreasedBy({ tokenA: loanFeeTokenA, tokenB: loanFeeTokenB });
      await assertBalanceDifferencesAre(DCAHubLoanCallee, { tokenA: loanFeeTokenA.mul(-1), tokenB: loanFeeTokenB.mul(-1) });

      await increasePosition(johnsPosition, { newSwaps: 10, amount: 100 });

      await assertPositionIsConsistentWithNoSwappedBalance(johnsPosition);
      await assertHubBalanceDifferencesAre({ tokenA: +100 });
      await assertBalanceDifferencesAre(john, { tokenA: -100 });

      const swapFee2 = 0.2;
      const swapRatioAB3: SwapRatio = { token0: tokenA, token1: tokenB, ratio: { token0: 1, token1: 2 } };
      const swapRatioBC2: SwapRatio = { token0: tokenB, token1: tokenC, ratio: { token0: 1, token1: 1 } };
      await setSwapFee(swapFee2);
      setSwapRatio(swapRatioAB3);
      setSwapRatio(swapRatioBC2);
      await evm.advanceTimeAndBlock(SwapInterval.ONE_HOUR.seconds);

      await assertIntervalsToSwapNowAre(SwapInterval.FIFTEEN_MINUTES, SwapInterval.ONE_HOUR);
      await assertAmountsToSwapAre({ tokenA: 545, tokenB: 200, tokenC: 0 });

      await flashSwap({ callee: DCAHubSwapCallee });

      await assertNoSwapsCanBeExecutedNow();
      await assertPositionIsConsistent(johnsPosition, {
        expectedSwapped: swapped({ rate: 45, ratio: swapRatioAB3, fee: swapFee2 }),
      });
      await assertPositionIsTerminated(joesPosition);
      await assertPositionIsConsistent(lucysPosition, {
        expectedSwapped: swapped({ rate: 200, ratio: swapRatioAB2, fee: swapFee1 }, { rate: 200, ratio: swapRatioAB2, fee: swapFee1 }),
      });
      await assertPositionIsConsistent(sarahsPosition1, {
        expectedSwapped: swapped({ rate: 500, ratio: swapRatioAB2, fee: swapFee1 }, { rate: 500, ratio: swapRatioAB3, fee: swapFee2 }),
      });
      await assertPositionIsConsistent(sarahsPosition2, {
        expectedSwapped: swapped({ rate: 100, ratio: swapRatioAB2, fee: swapFee1 }, { rate: 100, ratio: swapRatioAB3, fee: swapFee2 }),
      });
      await assertPositionIsConsistent(larrysPosition, {
        expectedSwapped: swapped({ rate: 100, ratio: swapRatioBC1, fee: swapFee1 }, { rate: 100, ratio: swapRatioBC2, fee: swapFee2 }),
      });
      await assertSwapOutcomeWas({
        tokens: { tokenA: -495, tokenB: +890, tokenC: +100 },
        totalFees: { tokenA: 0.1, tokenB: 2.18, tokenC: 0.2 },
      });

      await evm.advanceTimeAndBlock(SwapInterval.ONE_HOUR.seconds);
      await assertIntervalsToSwapNowAre(SwapInterval.FIFTEEN_MINUTES); // Even after waiting an hour, the 1 hour interval is not available. This is because it was marked as inactive on the last swap, since there were no more swaps on it

      await assertAmountsToSwapAre({ tokenA: 545, tokenB: 100, tokenC: 0 });

      await terminate(johnsPosition);

      await assertHubBalanceDifferencesAre({ tokenA: -405, tokenB: -89.82 });
      await assertBalanceDifferencesAre(john, { tokenA: +405, tokenB: +89.82 });
      await assertPositionIsTerminated(johnsPosition);
      await assertAmountsToSwapAre({ tokenA: 500, tokenB: 100, tokenC: 0 });

      await withdrawMany(sarahsPosition1, sarahsPosition2);
      await assertPositionIsConsistentWithNoSwappedBalance(sarahsPosition1);
      await assertPositionIsConsistentWithNoSwappedBalance(sarahsPosition2);

      await assertHubBalanceDifferencesAre({ tokenA: -149.6, tokenB: -1496.5 });
      await assertBalanceDifferencesAre(sarah, { tokenA: +149.6, tokenB: +1496.5 });

      await flashSwap({ callee: DCAHubSwapCallee });

      await assertNoSwapsCanBeExecutedNow();
      await assertPositionIsTerminated(johnsPosition);
      await assertPositionIsTerminated(joesPosition);
      await assertPositionIsConsistent(lucysPosition, {
        expectedSwapped: swapped({ rate: 200, ratio: swapRatioAB2, fee: swapFee1 }, { rate: 200, ratio: swapRatioAB2, fee: swapFee1 }),
      });
      await assertPositionIsConsistent(sarahsPosition1, {
        expectedSwapped: swapped({ rate: 500, ratio: swapRatioAB3, fee: swapFee2 }),
      });
      await assertPositionIsConsistent(sarahsPosition2, {
        expectedSwapped: swapped({ rate: 100, ratio: swapRatioAB3, fee: swapFee2 }),
      });
      await assertPositionIsConsistent(larrysPosition, {
        expectedSwapped: swapped({ rate: 100, ratio: swapRatioBC1, fee: swapFee1 }, { rate: 100, ratio: swapRatioBC2, fee: swapFee2 }),
      });
      await assertSwapOutcomeWas({ tokens: { tokenA: -450, tokenB: +900 }, totalFees: { tokenA: 0.1, tokenB: 2 } });

      await evm.advanceTimeAndBlock(SwapInterval.FIFTEEN_MINUTES.seconds);
      await assertAmountsToSwapAre({ tokenA: 0, tokenB: 100, tokenC: 0 });
    });

    async function withdrawMany(position1: UserPositionDefinition, ...otherPositions: UserPositionDefinition[]) {
      const positionMap: Map<string, Set<BigNumber>> = new Map();
      for (const position of [position1, ...otherPositions]) {
        if (!positionMap.has(position.to.address)) positionMap.set(position.to.address, new Set([position.id]));
        else positionMap.get(position.to.address)!.add(position.id);
      }
      const input = Array.from(positionMap.entries()).map(([token, positionIds]) => ({ token, positionIds: Array.from(positionIds.values()) }));
      await DCAHub.connect(position1.owner).withdrawSwappedMany(input, position1.owner.address);

      // Since the position is "resetted" with a withdraw, we need to reduce the amount of swaps
      for (const position of [position1].concat(otherPositions)) {
        const { swapsLeft } = await getPosition(position);
        position.amountOfSwaps = BigNumber.from(swapsLeft);
      }
    }

    async function terminate(
      position: UserPositionDefinition,
      options?: {
        caller?: SignerWithAddress;
        recipient?: HasAddress;
      }
    ) {
      const recipient = options?.recipient?.address ?? position.owner.address;
      await DCAHub.connect(options?.caller ?? position.owner).terminate(position.id, recipient, recipient);
    }

    async function setSwapFee(fee: number) {
      await DCAHub.setSwapFee(fee * 10000);
    }

    async function increasePosition(position: UserPositionDefinition, args: { newSwaps: number; amount: number }) {
      const token = position.from.address === tokenA.address ? tokenA : tokenB;
      await token.connect(position.owner).approve(DCAHub.address, token.asUnits(args.amount).mul(args.newSwaps));
      const response = await DCAHub.connect(position.owner).increasePosition(position.id, token.asUnits(args.amount), args.newSwaps);
      position.amountOfSwaps = BigNumber.from(args.newSwaps);
      position.rate = await readArgFromEventOrFail<BigNumber>(response, 'Modified', 'rate');
    }

    let ratios: Map<string, (amountIn: BigNumber) => BigNumber> = new Map();
    function setSwapRatio({ token0, token1, ratio }: SwapRatio) {
      if (token0.address < token1.address) {
        ratios.set(`${token1.address}${token0.address}`, (amountIn) =>
          amountIn.mul(token0.asUnits(ratio.token0 / ratio.token1)).div(token1.magnitude)
        );
      } else {
        ratios.set(`${token0.address}${token1.address}`, (amountIn) =>
          amountIn.mul(token1.asUnits(ratio.token1 / ratio.token0)).div(token0.magnitude)
        );
      }
      priceOracle.quote.returns(({ _amountIn, _tokenIn, _tokenOut }: { _tokenIn: string; _tokenOut: string; _amountIn: BigNumber }) =>
        ratios.get(`${_tokenIn}${_tokenOut}`)!(_amountIn)
      );
    }

    async function withdraw(
      position: UserPositionDefinition,
      options?: {
        caller?: SignerWithAddress;
        recipient?: HasAddress;
      }
    ): Promise<void> {
      await DCAHub.connect(options?.caller ?? position.owner).withdrawSwapped(
        position.id,
        options?.recipient?.address ?? position.owner.address
      );

      // Since the position is "resetted" with a withdraw, we need to reduce the amount of swaps
      const { swapsLeft } = await getPosition(position);
      position.amountOfSwaps = BigNumber.from(swapsLeft);
    }

    async function flashSwap({ callee }: { callee: HasAddress }) {
      const { tokens, pairIndexes, borrow } = buildSwapInput(
        [
          { tokenA: tokenA.address, tokenB: tokenB.address },
          { tokenA: tokenA.address, tokenB: tokenC.address },
          { tokenA: tokenB.address, tokenB: tokenC.address },
        ],
        []
      );
      await DCAHub.swap(tokens, pairIndexes, callee.address, callee.address, borrow, ethers.utils.randomBytes(5));
    }

    async function loan({
      callee,
      tokenA: amountTokenA,
      tokenB: amountTokenB,
    }: {
      callee: HasAddress;
      tokenA: number | BigNumber;
      tokenB: number | BigNumber;
    }) {
      await DCAHub.loan(
        [
          { token: tokenA.address, amount: asUnitsIfNeeded(tokenA, amountTokenA) },
          { token: tokenB.address, amount: asUnitsIfNeeded(tokenB, amountTokenB) },
        ],
        callee.address,
        ethers.utils.randomBytes(5)
      );
    }

    function getPosition(position: UserPositionDefinition): Promise<OngoingUserPosition> {
      return DCAHub.userPosition(position.id);
    }

    async function getNextSwapInfo() {
      const { tokens, pairIndexes } = buildGetNextSwapInfoInput(
        [
          { tokenA: tokenA.address, tokenB: tokenB.address },
          { tokenA: tokenA.address, tokenB: tokenC.address },
          { tokenA: tokenB.address, tokenB: tokenC.address },
        ],
        []
      );
      return DCAHub.getNextSwapInfo(tokens, pairIndexes);
    }

    async function reducePosition(position: UserPositionDefinition, args: { newSwaps: number; amount: number }) {
      const token = position.from.address === tokenA.address ? tokenA : tokenB;
      await token.connect(position.owner).approve(DCAHub.address, token.asUnits(args.amount).mul(args.newSwaps));
      const response = await DCAHub.connect(position.owner).reducePosition(
        position.id,
        token.asUnits(args.amount),
        args.newSwaps,
        position.owner.address
      );
      position.amountOfSwaps = BigNumber.from(args.newSwaps);
      position.rate = await readArgFromEventOrFail<BigNumber>(response, 'Modified', 'rate');
    }

    async function deposit({
      from,
      to,
      owner,
      rate,
      swapInterval,
      swaps,
      permissions,
    }: {
      from: TokenContract;
      to: TokenContract;
      owner: SignerWithAddress;
      rate: number;
      swapInterval: SwapInterval;
      swaps: number;
      permissions?: { operator: HasAddress; permissions: Permission[] }[];
    }): Promise<UserPositionDefinition> {
      const amount = from.asUnits(rate).mul(swaps);
      await from.mint(owner.address, amount);
      await from.connect(owner).approve(DCAHub.address, amount);
      const response: TransactionResponse = await DCAHub.connect(owner).deposit(
        from.address,
        to.address,
        amount,
        swaps,
        swapInterval.seconds,
        owner.address,
        (permissions ?? []).map(({ operator, permissions }) => ({ operator: operator.address, permissions }))
      );
      const positionId = await readArgFromEventOrFail<BigNumber>(response, 'Deposited', 'positionId');
      return {
        id: positionId,
        owner,
        from,
        to,
        swapInterval,
        rate: from.asUnits(rate),
        amountOfSwaps: BigNumber.from(swaps),
      };
    }

    function calculateSwapped({ from, to }: UserPositionDefinition, ...swaps: { rate: number; ratio: SwapRatio; fee: number }[]) {
      return swaps
        .map(({ rate, ratio, fee }) => {
          const rateBN = from.asUnits(rate);
          const tempRatio =
            to.address === ratio.token1.address ? ratio.ratio.token1 / ratio.ratio.token0 : ratio.ratio.token0 / ratio.ratio.token1;
          const swapped = tempRatio < 1 ? rateBN.div(1 / tempRatio) : rateBN.mul(tempRatio);
          const withCorrectDecimals = swapped.mul(to.magnitude).div(from.magnitude);
          return subtractFee(fee, withCorrectDecimals);
        })
        .reduce(sumBN);
    }

    function swapped(...swaps: { rate: number; ratio: SwapRatio; fee: number }[]) {
      return (position: UserPositionDefinition) => calculateSwapped(position, ...swaps);
    }

    function assertNoSwapsCanBeExecutedNow() {
      return assertIntervalsToSwapNowAre();
    }

    async function assertAmountsToSwapAre({ tokenA: expectedTokenA, tokenB: expectedTokenB, tokenC: expectedTokenC }: AmountForTokensBN) {
      const { pairs } = await getNextSwapInfo();
      const totalAmountsToSwap: Map<string, BigNumber> = new Map([
        [tokenA.address, constants.ZERO],
        [tokenB.address, constants.ZERO],
        [tokenC.address, constants.ZERO],
      ]);

      for (const pair of pairs) {
        const intervals = SwapInterval.intervalsfromByte(pair.intervalsInSwap);
        for (const interval of intervals) {
          const { nextAmountToSwapAToB, nextAmountToSwapBToA } = await DCAHub.swapData(pair.tokenA, pair.tokenB, interval.mask);
          totalAmountsToSwap.set(pair.tokenA, totalAmountsToSwap.get(pair.tokenA)!.add(nextAmountToSwapAToB));
          totalAmountsToSwap.set(pair.tokenB, totalAmountsToSwap.get(pair.tokenB)!.add(nextAmountToSwapBToA));
        }
      }

      expect(totalAmountsToSwap.get(tokenA.address)).to.equal(asUnitsIfNeeded(tokenA, expectedTokenA));
      expect(totalAmountsToSwap.get(tokenB.address)).to.equal(asUnitsIfNeeded(tokenB, expectedTokenB));
      expect(totalAmountsToSwap.get(tokenC.address)).to.equal(asUnitsIfNeeded(tokenC, expectedTokenC));
    }

    async function assertIntervalsToSwapNowAre(...swapIntervals: SwapInterval[]): Promise<void> {
      const nextSwapInfo = await getNextSwapInfo();
      const intervals = nextSwapInfo.pairs
        .map(({ intervalsInSwap }) => intervalsInSwap)
        .reduce((a, b) => '0x' + (parseInt(a) | parseInt(b)).toString(16).padStart(2, '0'), '0x00');
      expect(intervals).to.eql(SwapInterval.intervalsToByte(...swapIntervals));
    }

    function assertPositionIsConsistentWithNoSwappedBalance(position: UserPositionDefinition) {
      return assertPositionIsConsistent(position);
    }

    async function assertPositionIsConsistent(
      position: UserPositionDefinition,
      options?: { expectedSwapped: (position: UserPositionDefinition) => BigNumber }
    ) {
      const { from, to, swapInterval, rate, swapsExecuted, swapsLeft, remaining, swapped } = await getPosition(position);
      expect(from).to.equal(position.from.address);
      expect(to).to.equal(position.to.address);
      expect(swapInterval).to.equal(position.swapInterval.seconds);
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

    async function assertPositionIsTerminated(position: UserPositionDefinition) {
      const { from, to, swapInterval, rate, swapsExecuted, swapsLeft, remaining, swapped } = await getPosition(position);
      expect(from).to.equal(constants.ZERO_ADDRESS);
      expect(to).to.equal(constants.ZERO_ADDRESS);
      expect(swapInterval).to.equal(0);
      expect(rate).to.equal(0);
      expect(swapsExecuted).to.equal(0);
      expect(swapsLeft).to.equal(0);
      expect(remaining).to.equal(0);
      expect(swapped).to.equal(0);
    }

    async function assertHubBalanceDifferencesAre(args: AtLeastOneTokenBN) {
      await assertBalanceDifferencesAre(DCAHub, args);
    }

    let lastBalanceTokenA: Map<string, BigNumber> = new Map();
    let lastBalanceTokenB: Map<string, BigNumber> = new Map();
    let lastBalanceTokenC: Map<string, BigNumber> = new Map();
    async function assertBalanceDifferencesAre(
      hasAddress: HasAddress,
      { tokenA: diffTokenA, tokenB: diffTokenB, tokenC: diffTokenC }: AtLeastOneTokenBN
    ) {
      const diffA = !diffTokenA ? 0 : asUnitsIfNeeded(tokenA, diffTokenA);
      const diffB = !diffTokenB ? 0 : asUnitsIfNeeded(tokenB, diffTokenB);
      const diffC = !diffTokenC ? 0 : asUnitsIfNeeded(tokenC, diffTokenC);
      const previousBalanceA = lastBalanceTokenA.get(hasAddress.address) ?? constants.ZERO;
      const previousBalanceB = lastBalanceTokenB.get(hasAddress.address) ?? constants.ZERO;
      const previousBalanceC = lastBalanceTokenC.get(hasAddress.address) ?? constants.ZERO;
      const currentBalanceA = await tokenA.balanceOf(hasAddress.address);
      const currentBalanceB = await tokenB.balanceOf(hasAddress.address);
      const currentBalanceC = await tokenC.balanceOf(hasAddress.address);
      expect(currentBalanceA.sub(previousBalanceA), 'Unexpected diff in token A').to.equal(diffA);
      expect(currentBalanceB.sub(previousBalanceB), 'Unexpected diff in token B').to.equal(diffB);
      expect(currentBalanceC.sub(previousBalanceC), 'Unexpected diff in token C').to.equal(diffC);
      lastBalanceTokenA.set(hasAddress.address, currentBalanceA);
      lastBalanceTokenB.set(hasAddress.address, currentBalanceB);
      lastBalanceTokenC.set(hasAddress.address, currentBalanceC);
    }

    async function assertPlatformBalanceIncreasedBy({
      tokenA: increasedTokenA,
      tokenB: increasedTokenB,
      tokenC: increasedTokenC,
    }: AtLeastOneTokenBN) {
      const diffA = !increasedTokenA ? 0 : asUnitsIfNeeded(tokenA, increasedTokenA);
      const diffB = !increasedTokenB ? 0 : asUnitsIfNeeded(tokenB, increasedTokenB);
      const diffC = !increasedTokenC ? 0 : asUnitsIfNeeded(tokenC, increasedTokenC);
      const previousBalanceA = lastBalanceTokenA.get('platform') ?? constants.ZERO;
      const previousBalanceB = lastBalanceTokenB.get('platform') ?? constants.ZERO;
      const previousBalanceC = lastBalanceTokenC.get('platform') ?? constants.ZERO;
      const currentBalanceA = await DCAHub.platformBalance(tokenA.address);
      const currentBalanceB = await DCAHub.platformBalance(tokenB.address);
      const currentBalanceC = await DCAHub.platformBalance(tokenC.address);
      expect(currentBalanceA.sub(previousBalanceA)).to.equal(diffA);
      expect(currentBalanceB.sub(previousBalanceB)).to.equal(diffB);
      expect(currentBalanceC.sub(previousBalanceC)).to.equal(diffC);
      lastBalanceTokenA.set('platform', currentBalanceA);
      lastBalanceTokenB.set('platform', currentBalanceB);
      lastBalanceTokenC.set('platform', currentBalanceC);
    }

    function subtractFee(fee: number, number: BigNumber) {
      const percent = 100;
      return number.mul(percent * percent - fee * percent).div(percent * percent);
    }

    async function setInitialBalance(
      hasAddress: HasAddress,
      { tokenA: amountTokenA, tokenB: amountTokenB, tokenC: amountTokenC }: AmountForTokensBN
    ) {
      await tokenA.mint(hasAddress.address, asUnitsIfNeeded(tokenA, amountTokenA));
      await tokenB.mint(hasAddress.address, asUnitsIfNeeded(tokenB, amountTokenB));
      await tokenC.mint(hasAddress.address, asUnitsIfNeeded(tokenC, amountTokenC));
      lastBalanceTokenA.set(hasAddress.address, asUnitsIfNeeded(tokenA, amountTokenA));
      lastBalanceTokenB.set(hasAddress.address, asUnitsIfNeeded(tokenB, amountTokenB));
      lastBalanceTokenC.set(hasAddress.address, asUnitsIfNeeded(tokenC, amountTokenC));
    }

    function asUnitsIfNeeded(token: TokenContract, amount: BigNumber | number) {
      return BigNumber.isBigNumber(amount) ? amount : token.asUnits(amount);
    }

    function orZero(value?: number) {
      return value ?? 0;
    }

    async function assertSwapOutcomeWas({ tokens, totalFees }: { tokens: AtLeastOneToken; totalFees: AtLeastOneToken }) {
      const [feeTokenA, feeTokenB, feeTokenC] = [orZero(totalFees.tokenA) / 2, orZero(totalFees.tokenB) / 2, orZero(totalFees.tokenC) / 2];
      const [outcomeTokenA, outcomeTokenB, outcomeTokenC] = [orZero(tokens.tokenA), orZero(tokens.tokenB), orZero(tokens.tokenC)];
      const [diffTokenA, diffTokenB, diffTokenC] = [outcomeTokenA - feeTokenA, outcomeTokenB - feeTokenB, outcomeTokenC - feeTokenC];
      await assertHubBalanceDifferencesAre({ tokenA: diffTokenA, tokenB: diffTokenB, tokenC: diffTokenC });
      await assertBalanceDifferencesAre(DCAHubSwapCallee, { tokenA: -diffTokenA, tokenB: -diffTokenB, tokenC: -diffTokenC });
      await assertPlatformBalanceIncreasedBy({ tokenA: feeTokenA, tokenB: feeTokenB, tokenC: feeTokenC });
    }

    const sumBN = (accum: BigNumber, newValue: BigNumber) => accum.add(newValue);

    type SwapRatio = { token0: TokenContract; token1: TokenContract; ratio: { token0: 1; token1: number } | { token0: number; token1: 1 } };

    type UserPositionDefinition = {
      id: BigNumber;
      owner: SignerWithAddress;
      from: TokenContract;
      to: TokenContract;
      swapInterval: SwapInterval;
      rate: BigNumber;
      amountOfSwaps: BigNumber;
    };

    type OngoingUserPosition = [string, string, number, number, BigNumber, number, BigNumber, BigNumber] & {
      from: string;
      to: string;
      swapInterval: number;
      swapsExecuted: number;
      swapped: BigNumber;
      swapsLeft: number;
      remaining: BigNumber;
      rate: BigNumber;
    };

    type HasAddress = {
      readonly address: string;
    };

    type AmountForTokens = { tokenA: number; tokenB: number; tokenC: number };
    type AtLeastOneToken = RequireAtLeastOne<AmountForTokens, 'tokenA' | 'tokenB' | 'tokenC'>;
    type AmountForTokensBN = { tokenA: number | BigNumber; tokenB: number | BigNumber; tokenC: number | BigNumber };
    type AtLeastOneTokenBN = RequireAtLeastOne<AmountForTokensBN, 'tokenA' | 'tokenB' | 'tokenC'>;

    type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = Pick<T, Exclude<keyof T, Keys>> &
      {
        [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>>;
      }[Keys];
  });
});
