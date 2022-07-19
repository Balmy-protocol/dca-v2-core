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

    DCAHubSwapCallee = await DCAHubSwapCalleeFactory.deploy();
    await DCAHubSwapCallee.avoidRewardCheck();
    await tokenA.mint(DCAHubSwapCallee.address, utils.parseEther('6969696969420'));
    await tokenB.mint(DCAHubSwapCallee.address, utils.parseEther('6969696969420'));

    priceOracle.quote.returns(utils.parseEther('1'));

    snapshotId = await snapshot.take();
  });

  beforeEach(async () => {
    await snapshot.revert(snapshotId);
  });

  it('interval is set as inactive when there are no more swaps being executed', async () => {
    await deposit({
      from: tokenA,
      to: tokenB,
      owner: john,
      rate: 10,
      swaps: 1,
      swapInterval: SwapInterval.ONE_DAY,
    });
    await flashSwap({ callee: DCAHubSwapCallee });
    const activeIntervals = await DCAHub.activeSwapIntervals(tokenA.address, tokenB.address);
    expect(activeIntervals).to.equal('0x00');
  });

  it('interval continues to be active when there are more swaps left to be executed', async () => {
    await deposit({
      from: tokenA,
      to: tokenB,
      owner: john,
      rate: 10,
      swaps: 2,
      swapInterval: SwapInterval.ONE_DAY,
    });
    await flashSwap({ callee: DCAHubSwapCallee });
    const activeIntervals = await DCAHub.activeSwapIntervals(tokenA.address, tokenB.address);
    expect(activeIntervals).to.not.equal('0x00');
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
});
