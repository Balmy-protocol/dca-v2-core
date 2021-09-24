import { expect } from 'chai';
import { ethers } from 'hardhat';
import { DCAHubPlatformHandlerMock__factory, DCAHubPlatformHandlerMock } from '@typechained';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { erc20, behaviours, wallet } from '@test-utils';
import { given, then, when } from '@test-utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { TokenContract } from '@test-utils/erc20';
import { snapshot } from '@test-utils/evm';
import { readArgFromEventOrFail } from '@test-utils/event-utils';

describe('DCAHubPlatformHandler', () => {
  let timelocked: SignerWithAddress, platform: SignerWithAddress, recipient: SignerWithAddress;
  let platformWithdrawRole: string;
  let tokenA: TokenContract, tokenB: TokenContract;
  let DCAHubPlatformHandler: DCAHubPlatformHandlerMock;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    [timelocked, platform, recipient] = await ethers.getSigners();
    const DCAHubPlatformHandlerFactory: DCAHubPlatformHandlerMock__factory = await ethers.getContractFactory(
      'contracts/mocks/DCAHub/DCAHubPlatformHandler.sol:DCAHubPlatformHandlerMock'
    );
    tokenA = await erc20.deploy({
      name: 'tokenA',
      symbol: 'TKNA',
    });
    tokenB = await erc20.deploy({
      name: 'tokenB',
      symbol: 'TKNB',
    });
    DCAHubPlatformHandler = await DCAHubPlatformHandlerFactory.deploy(timelocked.address);
    platformWithdrawRole = await DCAHubPlatformHandler.PLATFORM_WITHDRAW_ROLE();
    await DCAHubPlatformHandler.grantRole(platformWithdrawRole, platform.address);
    snapshotId = await snapshot.take();
  });

  beforeEach('Deploy and configure', async () => {
    await snapshot.revert(snapshotId);
  });

  describe('withdrawFromPlatformBalance', () => {
    const INITIAL_PLATFORM_BALANCE_A = 1000;
    const INITIAL_PLATFORM_BALANCE_B = 500;
    const INITIAL_BALANCE_A = INITIAL_PLATFORM_BALANCE_A * 2;
    const INITIAL_BALANCE_B = INITIAL_PLATFORM_BALANCE_B * 2;

    given(async () => {
      await DCAHubPlatformHandler.setPlatformBalance(tokenA.address, INITIAL_PLATFORM_BALANCE_A);
      await DCAHubPlatformHandler.setPlatformBalance(tokenB.address, INITIAL_PLATFORM_BALANCE_B);
      await tokenA.mint(DCAHubPlatformHandler.address, INITIAL_BALANCE_A);
      await tokenB.mint(DCAHubPlatformHandler.address, INITIAL_BALANCE_B);
    });

    when('executing a withdraw', () => {
      const WITHDRAW_A = INITIAL_PLATFORM_BALANCE_A;
      const WITHDRAW_B = INITIAL_PLATFORM_BALANCE_B / 2;
      let tx: TransactionResponse;
      let withdraw: { token: string; amount: number }[];
      given(async () => {
        withdraw = [
          { token: tokenA.address, amount: WITHDRAW_A },
          { token: tokenB.address, amount: WITHDRAW_B },
        ];
        tx = await DCAHubPlatformHandler.connect(platform).withdrawFromPlatformBalance(withdraw, recipient.address);
      });

      then('tokens are removed from the handler', async () => {
        const balanceA = await tokenA.balanceOf(DCAHubPlatformHandler.address);
        const balanceB = await tokenB.balanceOf(DCAHubPlatformHandler.address);
        expect(balanceA).to.equal(INITIAL_BALANCE_A - WITHDRAW_A);
        expect(balanceB).to.equal(INITIAL_BALANCE_B - WITHDRAW_B);
      });
      then('tokens are sent to recipient', async () => {
        const balanceA = await tokenA.balanceOf(recipient.address);
        const balanceB = await tokenB.balanceOf(recipient.address);
        expect(balanceA).to.equal(WITHDRAW_A);
        expect(balanceB).to.equal(WITHDRAW_B);
      });
      then('platform balance is decreased correctly', async () => {
        const balanceA = await DCAHubPlatformHandler.platformBalance(tokenA.address);
        const balanceB = await DCAHubPlatformHandler.platformBalance(tokenB.address);
        expect(balanceA).to.equal(INITIAL_PLATFORM_BALANCE_A - WITHDRAW_A);
        expect(balanceB).to.equal(INITIAL_PLATFORM_BALANCE_B - WITHDRAW_B);
      });
      then('event is emitted', async () => {
        const sender = await readArgFromEventOrFail(tx, 'WithdrewFromPlatform', 'sender');
        const eventRecipient = await readArgFromEventOrFail(tx, 'WithdrewFromPlatform', 'recipient');
        const amounts = await readArgFromEventOrFail<any>(tx, 'WithdrewFromPlatform', 'amounts');
        expect(sender).to.equal(platform.address);
        expect(eventRecipient).to.equal(recipient.address);
        for (let i = 0; i < withdraw.length; i++) {
          expect(withdraw[i].amount).to.equal(amounts[i].amount);
          expect(withdraw[i].token).to.equal(amounts[i].token);
        }
      });
    });

    when('trying to withdraw more than belongs to the platform', () => {
      then('reverts with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAHubPlatformHandler.connect(platform),
          func: 'withdrawFromPlatformBalance',
          args: [[{ token: tokenA.address, amount: INITIAL_PLATFORM_BALANCE_A + 1 }], wallet.generateRandomAddress()],
          message:
            'VM Exception while processing transaction: reverted with panic code 0x11 (Arithmetic operation underflowed or overflowed outside of an unchecked block)',
        });
      });
    });

    behaviours.shouldBeExecutableOnlyByRole({
      contract: () => DCAHubPlatformHandler,
      funcAndSignature: 'withdrawFromPlatformBalance',
      params: [[], wallet.generateRandomAddress()],
      addressWithRole: () => platform,
      role: () => platformWithdrawRole,
    });
  });
});
