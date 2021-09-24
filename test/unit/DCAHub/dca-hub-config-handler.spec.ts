import { expect } from 'chai';
import { Contract } from 'ethers';
import { ethers } from 'hardhat';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { constants, behaviours, bn, contracts } from '@test-utils';
import { given, then, when, contract } from '@test-utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { snapshot } from '@test-utils/evm';
import { DCAHubConfigHandlerMock, DCAHubConfigHandlerMock__factory } from '@typechained';
import moment from 'moment';

contract('DCAHubConfigHandler', () => {
  const FIVE_MINUTES = moment.duration(5, 'minutes').asSeconds();
  const ONE_HOUR = moment.duration(1, 'hour').asSeconds();
  const ONE_DAY = moment.duration(1, 'day').asSeconds();

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

  describe('setLoanFee', () => {
    when('sets fee bigger than MAX_FEE', () => {
      then('tx is reverted with reason', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAHubConfigHandler.connect(timeLockedOwner),
          func: 'setLoanFee',
          args: [(await DCAHubConfigHandler.MAX_FEE()) + 1],
          message: 'HighFee',
        });
      });
    });
    when('sets fee that is not multiple of 100', () => {
      then('tx is reverted with reason', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAHubConfigHandler.connect(timeLockedOwner),
          func: 'setLoanFee',
          args: [99],
          message: 'InvalidFee',
        });
      });
    });
    when('sets fee equal to MAX_FEE', () => {
      then('sets fee and emits event', async () => {
        await behaviours.txShouldSetVariableAndEmitEvent({
          contract: DCAHubConfigHandler.connect(timeLockedOwner),
          getterFunc: 'loanFee',
          setterFunc: 'setLoanFee',
          variable: await DCAHubConfigHandler.MAX_FEE(),
          eventEmitted: 'LoanFeeSet',
        });
      });
    });
    when('sets fee lower to MAX_FEE', () => {
      then('sets fee and emits event', async () => {
        await behaviours.txShouldSetVariableAndEmitEvent({
          contract: DCAHubConfigHandler.connect(timeLockedOwner),
          getterFunc: 'loanFee',
          setterFunc: 'setLoanFee',
          variable: (await DCAHubConfigHandler.MAX_FEE()) - 100,
          eventEmitted: 'LoanFeeSet',
        });
      });
    });
    behaviours.shouldBeExecutableOnlyByRole({
      contract: () => DCAHubConfigHandler,
      funcAndSignature: 'setLoanFee(uint32)',
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
        await DCAHubConfigHandler.addSwapIntervalsToAllowedList([ONE_HOUR]);
      });
      then('tx is no op', async () => {
        await DCAHubConfigHandler.addSwapIntervalsToAllowedList([ONE_HOUR]);
      });
    });
    when('valid swap intervals are added', () => {
      let tx: TransactionResponse;
      given(async () => {
        await DCAHubConfigHandler.addSwapIntervalsToAllowedList([ONE_HOUR]);
        tx = await DCAHubConfigHandler.addSwapIntervalsToAllowedList([FIVE_MINUTES]);
      });
      then('intervals are added', async () => {
        expect(await DCAHubConfigHandler.isSwapIntervalAllowed(FIVE_MINUTES)).to.be.true;
      });
      then('previous allowed intervals are not removed', async () => {
        expect(await DCAHubConfigHandler.isSwapIntervalAllowed(ONE_HOUR)).to.be.true;
      });
      then('event is emitted', async () => {
        await expect(tx).to.emit(DCAHubConfigHandler, 'SwapIntervalsAllowed').withArgs([FIVE_MINUTES]);
      });
    });
    behaviours.shouldBeExecutableOnlyByRole({
      contract: () => DCAHubConfigHandler,
      funcAndSignature: 'addSwapIntervalsToAllowedList(uint32[])',
      params: [[ONE_HOUR]],
      addressWithRole: () => owner,
      role: () => immediateRole,
    });
  });
  describe('removeSwapIntervalsFromAllowedList', () => {
    given(async () => {
      await DCAHubConfigHandler.addSwapIntervalsToAllowedList([ONE_HOUR, FIVE_MINUTES]);
    });
    when('swap interval was not previously allowed', () => {
      then('tx is no op', async () => {
        await DCAHubConfigHandler.removeSwapIntervalsFromAllowedList([ONE_DAY]);
      });
    });
    when('swap interval was previously allowed and is removed', () => {
      let tx: TransactionResponse;

      given(async () => {
        tx = await DCAHubConfigHandler.removeSwapIntervalsFromAllowedList([ONE_HOUR]);
      });

      then('event is emitted', async () => {
        await expect(tx).to.emit(DCAHubConfigHandler, 'SwapIntervalsForbidden').withArgs([ONE_HOUR]);
      });
      then('interval is no longer allowed', async () => {
        expect(await DCAHubConfigHandler.isSwapIntervalAllowed(ONE_HOUR)).to.be.false;
      });
      then('other intervals are still allowed', async () => {
        expect(await DCAHubConfigHandler.isSwapIntervalAllowed(FIVE_MINUTES)).to.be.true;
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

  describe('isSwapIntervalAllowed', () => {
    when('querying for a swap interval that is not allowed', () => {
      then('returns false', async () => {
        expect(await DCAHubConfigHandler.isSwapIntervalAllowed(ONE_HOUR)).to.be.false;
      });
    });
    when('querying for an allowed swap interval', () => {
      given(async () => {
        await DCAHubConfigHandler.addSwapIntervalsToAllowedList([ONE_HOUR]);
      });
      then('returns true', async () => {
        expect(await DCAHubConfigHandler.isSwapIntervalAllowed(ONE_HOUR)).to.be.true;
      });
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
});
