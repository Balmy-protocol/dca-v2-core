import { expect } from 'chai';
import { BigNumber, utils } from 'ethers';
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
import { contract } from '@test-utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { TokenContract } from '@test-utils/erc20';
import { readArgFromEventOrFail } from '@test-utils/event-utils';
import { buildSwapInput } from 'js-lib/swap-utils';
import { SwapInterval } from 'js-lib/interval-utils';
import { FakeContract, smock } from '@defi-wonderland/smock';
import { snapshot } from '@test-utils/evm';

contract('DCAHub', () => {
  let snapshotId: string;
  let governor: SignerWithAddress, john: SignerWithAddress;
  let tokenA: TokenContract, tokenB: TokenContract;
  let DCAHubFactory: DCAHub__factory, DCAHub: DCAHub;
  let priceOracle: FakeContract<IPriceOracle>;
  let DCAHubSwapCalleeFactory: DCAHubSwapCalleeMock__factory, DCAHubSwapCallee: DCAHubSwapCalleeMock;
  let DCAPermissionsManagerFactory: DCAPermissionsManager__factory, DCAPermissionsManager: DCAPermissionsManager;

  before('Setup accounts and contracts', async () => {
    [governor, john] = await ethers.getSigners();
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
    DCAPermissionsManager = await DCAPermissionsManagerFactory.deploy(constants.NOT_ZERO_ADDRESS, constants.NOT_ZERO_ADDRESS);

    DCAHub = await DCAHubFactory.deploy(governor.address, governor.address, priceOracle.address, DCAPermissionsManager.address);
    await DCAPermissionsManager.setHub(DCAHub.address);
    await DCAHub.setAllowedTokens([tokenA.address, tokenB.address], [true, true]);
    await DCAHub.addSwapIntervalsToAllowedList([SwapInterval.ONE_MINUTE.seconds]);

    DCAHubSwapCallee = await DCAHubSwapCalleeFactory.deploy();
    await DCAHubSwapCallee.avoidRewardCheck();
    await tokenA.mint(DCAHubSwapCallee.address, utils.parseEther('6969696969420'));
    await tokenB.mint(DCAHubSwapCallee.address, utils.parseEther('6969696969420'));

    setSwapRatio({
      token0: tokenA,
      token1: tokenB,
      ratio: {
        token0: 1,
        token1: 1,
      },
    });
    snapshotId = await snapshot.take();
  });

  beforeEach('Deploy and configure', async () => {
    await snapshot.revert(snapshotId);
  });

  it('allows to withdraw unallowed tokens', async () => {
    const positionId = await deposit({
      from: tokenA,
      to: tokenB,
      owner: john,
      rate: 10,
      swaps: 4,
      swapInterval: SwapInterval.ONE_MINUTE,
    });
    await flashSwap({ callee: DCAHubSwapCallee });
    await DCAHub.setAllowedTokens([tokenB.address], [false]);
    const previousBalance = await tokenB.balanceOf(john.address);
    await DCAHub.connect(john).withdrawSwapped(positionId, john.address);
    expect(await tokenB.balanceOf(john.address)).to.be.gt(previousBalance);
  });

  it('allows to reduce positions with unallowed tokens', async () => {
    const positionId = await deposit({
      from: tokenA,
      to: tokenB,
      owner: john,
      rate: 10,
      swaps: 4,
      swapInterval: SwapInterval.ONE_MINUTE,
    });
    await DCAHub.setAllowedTokens([tokenA.address], [false]);
    const previousBalance = await tokenA.balanceOf(john.address);
    await DCAHub.connect(john).reducePosition(positionId, 1, 1, john.address);
    expect(await tokenA.balanceOf(john.address)).to.be.gt(previousBalance);
  });

  it('allows to terminate positions with unallowed tokens', async () => {
    const positionId = await deposit({
      from: tokenA,
      to: tokenB,
      owner: john,
      rate: 10,
      swaps: 4,
      swapInterval: SwapInterval.ONE_MINUTE,
    });
    await flashSwap({ callee: DCAHubSwapCallee });
    await DCAHub.setAllowedTokens([tokenA.address, tokenB.address], [false, false]);
    const previousBalanceA = await tokenA.balanceOf(john.address);
    const previousBalanceB = await tokenB.balanceOf(john.address);
    await DCAHub.connect(john).terminate(positionId, john.address, john.address);
    expect(await tokenA.balanceOf(john.address)).to.be.gt(previousBalanceA);
    expect(await tokenB.balanceOf(john.address)).to.be.gt(previousBalanceB);
  });

  it('doesnt allow to swap pairs with unallowed tokens', async () => {
    await deposit({
      from: tokenA,
      to: tokenB,
      owner: john,
      rate: 10,
      swaps: 4,
      swapInterval: SwapInterval.ONE_MINUTE,
    });
    const { tokens, pairIndexes, borrow } = buildSwapInput([{ tokenA: tokenA.address, tokenB: tokenB.address }], []);
    await DCAHub.setAllowedTokens([tokenA.address], [false]);
    await expect(
      DCAHub.swap(tokens, pairIndexes, DCAHubSwapCallee.address, DCAHubSwapCallee.address, borrow, ethers.utils.randomBytes(5))
    ).to.be.revertedWith('UnallowedToken');
    await DCAHub.setAllowedTokens([tokenA.address, tokenB.address], [true, false]);
    await expect(
      DCAHub.swap(tokens, pairIndexes, DCAHubSwapCallee.address, DCAHubSwapCallee.address, borrow, ethers.utils.randomBytes(5))
    ).to.be.revertedWith('UnallowedToken');
  });

  it('user flow works even allowing previously unallowed tokens', async () => {
    const positionId = await deposit({
      from: tokenA,
      to: tokenB,
      owner: john,
      rate: 10,
      swaps: 4,
      swapInterval: SwapInterval.ONE_MINUTE,
    });
    await flashSwap({ callee: DCAHubSwapCallee });
    await DCAHub.setAllowedTokens([tokenA.address, tokenB.address], [false, false]);
    const previousBalance = await tokenB.balanceOf(john.address);
    await DCAHub.connect(john).withdrawSwapped(positionId, john.address);
    expect(await tokenB.balanceOf(john.address)).to.be.gt(previousBalance);
    const { tokens, pairIndexes, borrow } = buildSwapInput([{ tokenA: tokenA.address, tokenB: tokenB.address }], []);
    await evm.advanceTimeAndBlock(SwapInterval.ONE_MINUTE.seconds);
    await expect(
      DCAHub.swap(tokens, pairIndexes, DCAHubSwapCallee.address, DCAHubSwapCallee.address, borrow, ethers.utils.randomBytes(5))
    ).to.be.revertedWith('UnallowedToken');
    await DCAHub.setAllowedTokens([tokenA.address, tokenB.address], [true, true]);
    await flashSwap({ callee: DCAHubSwapCallee });
    const previousBalanceA = await tokenA.balanceOf(john.address);
    const previousBalanceB = await tokenB.balanceOf(john.address);
    await DCAHub.connect(john).terminate(positionId, john.address, john.address);
    expect(await tokenA.balanceOf(john.address)).to.be.gt(previousBalanceA);
    expect(await tokenB.balanceOf(john.address)).to.be.gt(previousBalanceB);
  });

  async function deposit({
    from,
    to,
    owner,
    rate,
    swapInterval,
    swaps,
  }: {
    from: TokenContract;
    to: TokenContract;
    owner: SignerWithAddress;
    rate: number;
    swapInterval: SwapInterval;
    swaps: number;
  }): Promise<BigNumber> {
    const amount = from.asUnits(rate).mul(swaps);
    await from.mint(owner.address, amount);
    await from.connect(owner).approve(DCAHub.address, amount);
    const response: TransactionResponse = await DCAHub.connect(owner)[
      'deposit(address,address,uint256,uint32,uint32,address,(address,uint8[])[])'
    ](from.address, to.address, amount, swaps, swapInterval.seconds, owner.address, []);
    return await readArgFromEventOrFail<BigNumber>(response, 'Deposited', 'positionId');
  }

  async function flashSwap({ callee }: { callee: HasAddress }) {
    const { tokens, pairIndexes, borrow } = buildSwapInput([{ tokenA: tokenA.address, tokenB: tokenB.address }], []);
    await DCAHub.swap(tokens, pairIndexes, callee.address, callee.address, borrow, ethers.utils.randomBytes(5));
  }

  type HasAddress = {
    readonly address: string;
  };

  let ratios: Map<string, (amountIn: BigNumber) => BigNumber> = new Map();
  type SwapRatio = { token0: TokenContract; token1: TokenContract; ratio: { token0: 1; token1: number } | { token0: number; token1: 1 } };
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
});
