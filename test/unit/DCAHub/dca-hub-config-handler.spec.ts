import { expect } from 'chai';
import { BigNumber, Contract, utils } from 'ethers';
import { ethers } from 'hardhat';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { constants, behaviours, contracts } from '@test-utils';
import { given, then, when, contract } from '@test-utils/bdd';
import { snapshot } from '@test-utils/evm';
import { DCAHubConfigHandlerMock, DCAHubConfigHandlerMock__factory, IERC20Metadata, IERC20Metadata__factory } from '@typechained';
import moment from 'moment';
import { SwapInterval } from 'js-lib/interval-utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { generateRandomAddress } from '@test-utils/wallet';
import { FakeContract, smock } from '@defi-wonderland/smock';
import { IERC20 } from '@mean-finance/deterministic-factory/typechained';

contract('DCAHubConfigHandler', () => {
  let owner: SignerWithAddress, timeLockedOwner: SignerWithAddress, oracle: SignerWithAddress;
  let DCAHubConfigHandlerFactory: DCAHubConfigHandlerMock__factory;
  let DCAHubConfigHandler: DCAHubConfigHandlerMock;
  let immediateRole: string, timeLockedRole: string;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    [owner, timeLockedOwner, oracle] = await ethers.getSigners();
    DCAHubConfigHandlerFactory = await ethers.getContractFactory('contracts/mocks/DCAHub/DCAHubConfigHandler.sol:DCAHubConfigHandlerMock');
    DCAHubConfigHandler = await DCAHubConfigHandlerFactory.deploy(owner.address, timeLockedOwner.address, oracle.address);
    immediateRole = await DCAHubConfigHandler.IMMEDIATE_ROLE();
    timeLockedRole = await DCAHubConfigHandler.TIME_LOCKED_ROLE();
    snapshotId = await snapshot.take();
  });

  beforeEach('Deploy and configure', async () => {
    await snapshot.revert(snapshotId);
  });

  describe('constructor', () => {
    when('immediate governor is zero address', () => {
      then('tx is reverted with reason error', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: DCAHubConfigHandlerFactory,
          args: [constants.ZERO_ADDRESS, constants.NOT_ZERO_ADDRESS, constants.NOT_ZERO_ADDRESS],
          message: 'ZeroAddress',
        });
      });
    });
    when('time locked governor is zero address', () => {
      then('tx is reverted with reason error', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: DCAHubConfigHandlerFactory,
          args: [constants.NOT_ZERO_ADDRESS, constants.ZERO_ADDRESS, constants.NOT_ZERO_ADDRESS],
          message: 'ZeroAddress',
        });
      });
    });
    when('oracle is zero address', () => {
      then('tx is reverted with reason error', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: DCAHubConfigHandlerFactory,
          args: [constants.NOT_ZERO_ADDRESS, constants.NOT_ZERO_ADDRESS, constants.ZERO_ADDRESS],
          message: 'ZeroAddress',
        });
      });
    });
    when('all arguments are valid', () => {
      let deployedContract: Contract;
      given(async () => {
        const deployment = await contracts.deploy(DCAHubConfigHandlerFactory, [owner.address, timeLockedOwner.address, oracle.address]);
        deployedContract = deployment.contract;
      });
      then('sets immediate governor correctly', async () => {
        expect(await deployedContract.hasRole(immediateRole, owner.address)).to.be.true;
      });
      then('sets time locked governor correctly', async () => {
        expect(await deployedContract.hasRole(timeLockedRole, timeLockedOwner.address)).to.be.true;
      });
      then('sets oracle correctly', async () => {
        expect(await deployedContract.oracle()).to.equal(oracle.address);
      });
      then('contract starts as unpaused', async () => {
        expect(await deployedContract.paused()).to.be.false;
      });
      then(`immediate role is platform withdraw's admin`, async () => {
        const adminRole = await deployedContract.getRoleAdmin(await deployedContract.PLATFORM_WITHDRAW_ROLE());
        expect(adminRole).to.equal(immediateRole);
      });
      then(`immediate role is privileged swappers's admin`, async () => {
        const adminRole = await deployedContract.getRoleAdmin(await deployedContract.PRIVILEGED_SWAPPER_ROLE());
        expect(adminRole).to.equal(immediateRole);
      });
      then(`bigger intervals start allowed`, async () => {
        const allowedIntervals = [SwapInterval.ONE_WEEK, SwapInterval.ONE_DAY, SwapInterval.FOUR_HOURS, SwapInterval.ONE_HOUR];
        for (const interval of allowedIntervals) {
          expect(await isSwapIntervalAllowed(interval)).to.be.true;
        }
      });
      then(`smaller intervals are not allowed`, async () => {
        const nonAllowedInterval = [
          SwapInterval.THIRTY_MINUTES,
          SwapInterval.FIFTEEN_MINUTES,
          SwapInterval.FIVE_MINUTES,
          SwapInterval.ONE_MINUTE,
        ];
        for (const interval of nonAllowedInterval) {
          expect(await isSwapIntervalAllowed(interval)).to.be.false;
        }
      });
      then(`platform fee ratio starts at 25%`, async () => {
        const platformFeeRatio = await deployedContract.platformFeeRatio();
        const maxPlatformFeeRatio = await deployedContract.MAX_PLATFORM_FEE_RATIO();
        expect(platformFeeRatio).to.equal(maxPlatformFeeRatio / 4);
      });
    });
  });

  describe('setAllowedTokens', () => {
    behaviours.shouldBeExecutableOnlyByRole({
      contract: () => DCAHubConfigHandler,
      funcAndSignature: 'setAllowedTokens(address[],bool[])',
      params: [[], []],
      addressWithRole: () => owner,
      role: () => immediateRole,
    });
    when('tokens and allowed arrays have different length', () => {
      then('tx is reverted with reason', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAHubConfigHandler,
          func: 'setAllowedTokens',
          args: [[generateRandomAddress()], []],
          message: 'InvalidAllowedTokensInput',
        });
      });
    });
    when('setting allowed tokens for the first time', () => {
      let tokenA: FakeContract<IERC20Metadata>, tokenB: FakeContract<IERC20Metadata>;
      let tx: TransactionResponse;
      given(async () => {
        tokenA = await smock.fake(IERC20Metadata__factory.abi);
        tokenB = await smock.fake(IERC20Metadata__factory.abi);
        tokenA.decimals.returns(18);
        tokenB.decimals.returns(2);
        tx = await DCAHubConfigHandler.setAllowedTokens([tokenA.address, tokenB.address], [true, false]);
      });
      then('sets token allowed state', async () => {
        expect(await DCAHubConfigHandler.allowedTokens(tokenA.address)).to.be.true;
        expect(await DCAHubConfigHandler.allowedTokens(tokenB.address)).to.be.false;
      });
      then('sets magnitude of tokens', async () => {
        expect(await DCAHubConfigHandler.tokenMagnitude(tokenA.address)).to.equal(utils.parseUnits('1', await tokenA.decimals()));
        expect(await DCAHubConfigHandler.tokenMagnitude(tokenB.address)).to.equal(utils.parseUnits('1', await tokenB.decimals()));
      });
      then('event is emitted', async () => {
        await expect(tx).to.emit(DCAHubConfigHandler, 'TokensAllowedUpdated').withArgs([tokenA.address, tokenB.address], [true, false]);
      });
    });

    when('setting tokens as unallowed', () => {
      let token: FakeContract<IERC20Metadata>;
      given(async () => {
        token = await smock.fake(IERC20Metadata__factory.abi);
        token.decimals.returns(3);
      });
      context('they were already unallowed', () => {
        given(async () => {
          await DCAHubConfigHandler.setAllowedTokens([token.address], [false]);
        });
        then('token is unallowed', async () => {
          expect(await DCAHubConfigHandler.allowedTokens(token.address)).to.be.false;
        });
      });
      context('they where allowed', () => {
        given(async () => {
          await DCAHubConfigHandler.setAllowedTokens([token.address], [true]);
          await DCAHubConfigHandler.setAllowedTokens([token.address], [false]);
        });
        then('token is unallowed', async () => {
          expect(await DCAHubConfigHandler.allowedTokens(token.address)).to.be.false;
        });
      });
    });
  });

  describe('setOracle', () => {
    when('address is zero', () => {
      then('tx is reverted with reason', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAHubConfigHandler.connect(timeLockedOwner),
          func: 'setOracle',
          args: [constants.ZERO_ADDRESS],
          message: 'ZeroAddress',
        });
      });
    });
    when('address is not zero', () => {
      then('sets oracle and emits event with correct arguments', async () => {
        await behaviours.txShouldSetVariableAndEmitEvent({
          contract: DCAHubConfigHandler.connect(timeLockedOwner),
          getterFunc: 'oracle',
          setterFunc: 'setOracle',
          variable: constants.NOT_ZERO_ADDRESS,
          eventEmitted: 'OracleSet',
        });
      });
    });

    behaviours.shouldBeExecutableOnlyByRole({
      contract: () => DCAHubConfigHandler,
      funcAndSignature: 'setOracle(address)',
      params: [constants.NOT_ZERO_ADDRESS],
      addressWithRole: () => timeLockedOwner,
      role: () => timeLockedRole,
    });
  });

  describe('setSwapFee', () => {
    when('sets fee bigger than MAX_FEE', () => {
      then('tx is reverted with reason', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAHubConfigHandler.connect(timeLockedOwner),
          func: 'setSwapFee',
          args: [(await DCAHubConfigHandler.MAX_FEE()) + 1],
          message: 'HighFee',
        });
      });
    });
    when('sets fee that is not multiple of 100', () => {
      then('tx is reverted with reason', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAHubConfigHandler.connect(timeLockedOwner),
          func: 'setSwapFee',
          args: [99],
          message: 'InvalidFee',
        });
      });
    });
    when('sets fee equal to MAX_FEE', () => {
      then('sets fee and emits event', async () => {
        await behaviours.txShouldSetVariableAndEmitEvent({
          contract: DCAHubConfigHandler.connect(timeLockedOwner),
          getterFunc: 'swapFee',
          setterFunc: 'setSwapFee',
          variable: await DCAHubConfigHandler.MAX_FEE(),
          eventEmitted: 'SwapFeeSet',
        });
      });
    });
    when('sets fee lower to MAX_FEE', () => {
      then('sets fee and emits event', async () => {
        await behaviours.txShouldSetVariableAndEmitEvent({
          contract: DCAHubConfigHandler.connect(timeLockedOwner),
          getterFunc: 'swapFee',
          setterFunc: 'setSwapFee',
          variable: (await DCAHubConfigHandler.MAX_FEE()) - 100,
          eventEmitted: 'SwapFeeSet',
        });
      });
    });
    behaviours.shouldBeExecutableOnlyByRole({
      contract: () => DCAHubConfigHandler,
      funcAndSignature: 'setSwapFee(uint32)',
      params: [1],
      addressWithRole: () => timeLockedOwner,
      role: () => timeLockedRole,
    });
  });

  describe('setPlatformFeeRatio', () => {
    when('sets ratio is bigger than allowed', () => {
      then('tx is reverted with reason', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAHubConfigHandler.connect(timeLockedOwner),
          func: 'setPlatformFeeRatio',
          args: [(await DCAHubConfigHandler.MAX_PLATFORM_FEE_RATIO()) + 1],
          message: 'HighPlatformFeeRatio',
        });
      });
    });
    when('sets ratio equal to maximum allowed', () => {
      then('sets fee and emits event', async () => {
        await behaviours.txShouldSetVariableAndEmitEvent({
          contract: DCAHubConfigHandler.connect(timeLockedOwner),
          getterFunc: 'platformFeeRatio',
          setterFunc: 'setPlatformFeeRatio',
          variable: await DCAHubConfigHandler.MAX_PLATFORM_FEE_RATIO(),
          eventEmitted: 'PlatformFeeRatioSet',
        });
      });
    });
    when('sets fee lower than maximum allowed', () => {
      then('sets fee and emits event', async () => {
        await behaviours.txShouldSetVariableAndEmitEvent({
          contract: DCAHubConfigHandler.connect(timeLockedOwner),
          getterFunc: 'platformFeeRatio',
          setterFunc: 'setPlatformFeeRatio',
          variable: (await DCAHubConfigHandler.MAX_PLATFORM_FEE_RATIO()) - 1,
          eventEmitted: 'PlatformFeeRatioSet',
        });
      });
    });
    behaviours.shouldBeExecutableOnlyByRole({
      contract: () => DCAHubConfigHandler,
      funcAndSignature: 'setPlatformFeeRatio(uint16)',
      params: [1],
      addressWithRole: () => timeLockedOwner,
      role: () => timeLockedRole,
    });
  });

  describe('addSwapIntervalsToAllowedList', () => {
    when('one of the intervals not supported', () => {
      then('tx is reverted with reason', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAHubConfigHandler,
          func: 'addSwapIntervalsToAllowedList',
          args: [[moment.duration(3, 'minutes').asSeconds()]],
          message: 'InvalidInterval',
        });
      });
    });
    when('one of the intervals was already allowed', () => {
      given(async () => {
        await DCAHubConfigHandler.addSwapIntervalsToAllowedList([SwapInterval.ONE_HOUR.seconds]);
      });
      then('tx is no op', async () => {
        await DCAHubConfigHandler.addSwapIntervalsToAllowedList([SwapInterval.ONE_HOUR.seconds]);
      });
    });
    when('valid swap intervals are added', () => {
      let tx: TransactionResponse;
      given(async () => {
        await DCAHubConfigHandler.addSwapIntervalsToAllowedList([SwapInterval.ONE_HOUR.seconds]);
        tx = await DCAHubConfigHandler.addSwapIntervalsToAllowedList([SwapInterval.FIVE_MINUTES.seconds]);
      });
      then('intervals are added', async () => {
        expect(await isSwapIntervalAllowed(SwapInterval.FIVE_MINUTES)).to.be.true;
      });
      then('previous allowed intervals are not removed', async () => {
        expect(await isSwapIntervalAllowed(SwapInterval.ONE_HOUR)).to.be.true;
      });
      then('event is emitted', async () => {
        await expect(tx).to.emit(DCAHubConfigHandler, 'SwapIntervalsAllowed').withArgs([SwapInterval.FIVE_MINUTES.seconds]);
      });
    });
    behaviours.shouldBeExecutableOnlyByRole({
      contract: () => DCAHubConfigHandler,
      funcAndSignature: 'addSwapIntervalsToAllowedList(uint32[])',
      params: [[SwapInterval.ONE_HOUR.seconds]],
      addressWithRole: () => owner,
      role: () => immediateRole,
    });
  });
  describe('removeSwapIntervalsFromAllowedList', () => {
    given(async () => {
      await DCAHubConfigHandler.addSwapIntervalsToAllowedList([SwapInterval.ONE_HOUR.seconds, SwapInterval.FIVE_MINUTES.seconds]);
    });
    when('swap interval was not previously allowed', () => {
      then('tx is no op', async () => {
        await DCAHubConfigHandler.removeSwapIntervalsFromAllowedList([SwapInterval.ONE_DAY.seconds]);
      });
    });
    when('swap interval was previously allowed and is removed', () => {
      let tx: TransactionResponse;

      given(async () => {
        tx = await DCAHubConfigHandler.removeSwapIntervalsFromAllowedList([SwapInterval.ONE_HOUR.seconds]);
      });

      then('event is emitted', async () => {
        await expect(tx).to.emit(DCAHubConfigHandler, 'SwapIntervalsForbidden').withArgs([SwapInterval.ONE_HOUR.seconds]);
      });
      then('interval is no longer allowed', async () => {
        expect(await isSwapIntervalAllowed(SwapInterval.ONE_HOUR)).to.be.false;
      });
      then('other intervals are still allowed', async () => {
        expect(await isSwapIntervalAllowed(SwapInterval.FIVE_MINUTES)).to.be.true;
      });
    });
    behaviours.shouldBeExecutableOnlyByRole({
      contract: () => DCAHubConfigHandler,
      funcAndSignature: 'removeSwapIntervalsFromAllowedList(uint32[])',
      params: [[1]],
      addressWithRole: () => owner,
      role: () => immediateRole,
    });
  });

  describe('pause', () => {
    when('contract is paused', () => {
      let tx: TransactionResponse;

      given(async () => {
        tx = await DCAHubConfigHandler.pause();
      });

      then('getter says so', async () => {
        expect(await DCAHubConfigHandler.paused()).to.be.true;
      });

      then('attempts to pause it again will revert', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAHubConfigHandler,
          func: 'pause',
          args: [],
          message: 'Pausable: paused',
        });
      });

      then('event is emitted', async () => {
        await expect(tx).to.emit(DCAHubConfigHandler, 'Paused');
      });
    });

    behaviours.shouldBeExecutableOnlyByRole({
      contract: () => DCAHubConfigHandler,
      funcAndSignature: 'pause()',
      params: [],
      addressWithRole: () => owner,
      role: () => immediateRole,
    });
  });

  describe('unpause', () => {
    given(async () => {
      await DCAHubConfigHandler.pause();
    });

    when('contract is unpaused', () => {
      let tx: TransactionResponse;

      given(async () => {
        tx = await DCAHubConfigHandler.unpause();
      });

      then('getter says so', async () => {
        expect(await DCAHubConfigHandler.paused()).to.be.false;
      });

      then('attempts to unpause it again will revert', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAHubConfigHandler,
          func: 'unpause',
          args: [],
          message: 'Pausable: not paused',
        });
      });

      then('event is emitted', async () => {
        await expect(tx).to.emit(DCAHubConfigHandler, 'Unpaused');
      });
    });

    behaviours.shouldBeExecutableOnlyByRole({
      contract: () => DCAHubConfigHandler,
      funcAndSignature: 'unpause()',
      params: [],
      addressWithRole: () => owner,
      role: () => immediateRole,
    });
  });

  async function isSwapIntervalAllowed(interval: SwapInterval): Promise<boolean> {
    const byteSet = await DCAHubConfigHandler.allowedSwapIntervals();
    return interval.isInByteSet(byteSet);
  }
});
