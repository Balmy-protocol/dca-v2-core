import { expect } from 'chai';
import { Contract } from 'ethers';
import { ethers } from 'hardhat';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { constants, behaviours, bn, contracts } from '@test-utils';
import { given, then, when, contract } from '@test-utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { snapshot } from '@test-utils/evm';
import { DCAHubConfigHandlerMock, DCAHubConfigHandlerMock__factory } from '@typechained';

contract('DCAHubConfigHandler', () => {
  let owner: SignerWithAddress, timeLockedOwner: SignerWithAddress, nftDescriptor: SignerWithAddress, oracle: SignerWithAddress;
  let DCAHubConfigHandlerFactory: DCAHubConfigHandlerMock__factory;
  let DCAHubConfigHandler: DCAHubConfigHandlerMock;
  let immediateRole: string, timeLockedRole: string;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    [owner, timeLockedOwner, nftDescriptor, oracle] = await ethers.getSigners();
    DCAHubConfigHandlerFactory = await ethers.getContractFactory('contracts/mocks/DCAHub/DCAHubConfigHandler.sol:DCAHubConfigHandlerMock');
    DCAHubConfigHandler = await DCAHubConfigHandlerFactory.deploy(
      constants.NOT_ZERO_ADDRESS,
      constants.NOT_ZERO_ADDRESS,
      constants.NOT_ZERO_ADDRESS,
      owner.address,
      timeLockedOwner.address,
      nftDescriptor.address,
      oracle.address
    );
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
          args: [
            constants.NOT_ZERO_ADDRESS,
            constants.NOT_ZERO_ADDRESS,
            constants.NOT_ZERO_ADDRESS,
            constants.ZERO_ADDRESS,
            constants.NOT_ZERO_ADDRESS,
            constants.NOT_ZERO_ADDRESS,
            constants.NOT_ZERO_ADDRESS,
          ],
          message: 'ZeroAddress',
        });
      });
    });
    when('time locked governor is zero address', () => {
      then('tx is reverted with reason error', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: DCAHubConfigHandlerFactory,
          args: [
            constants.NOT_ZERO_ADDRESS,
            constants.NOT_ZERO_ADDRESS,
            constants.NOT_ZERO_ADDRESS,
            constants.NOT_ZERO_ADDRESS,
            constants.ZERO_ADDRESS,
            constants.NOT_ZERO_ADDRESS,
            constants.NOT_ZERO_ADDRESS,
          ],
          message: 'ZeroAddress',
        });
      });
    });
    when('nft descriptor is zero address', () => {
      then('tx is reverted with reason error', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: DCAHubConfigHandlerFactory,
          args: [
            constants.NOT_ZERO_ADDRESS,
            constants.NOT_ZERO_ADDRESS,
            constants.NOT_ZERO_ADDRESS,
            constants.NOT_ZERO_ADDRESS,
            constants.NOT_ZERO_ADDRESS,
            constants.ZERO_ADDRESS,
            constants.NOT_ZERO_ADDRESS,
          ],
          message: 'ZeroAddress',
        });
      });
    });
    when('oracle is zero address', () => {
      then('tx is reverted with reason error', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: DCAHubConfigHandlerFactory,
          args: [
            constants.NOT_ZERO_ADDRESS,
            constants.NOT_ZERO_ADDRESS,
            constants.NOT_ZERO_ADDRESS,
            constants.NOT_ZERO_ADDRESS,
            constants.NOT_ZERO_ADDRESS,
            constants.NOT_ZERO_ADDRESS,
            constants.ZERO_ADDRESS,
          ],
          message: 'ZeroAddress',
        });
      });
    });
    when('all arguments are valid', () => {
      let deployedContract: Contract;
      given(async () => {
        const deployment = await contracts.deploy(DCAHubConfigHandlerFactory, [
          constants.NOT_ZERO_ADDRESS,
          constants.NOT_ZERO_ADDRESS,
          constants.NOT_ZERO_ADDRESS,
          owner.address,
          timeLockedOwner.address,
          nftDescriptor.address,
          oracle.address,
        ]);
        deployedContract = deployment.contract;
      });
      then('sets immediate governor correctly', async () => {
        expect(await deployedContract.hasRole(immediateRole, owner.address)).to.be.true;
      });
      then('sets time locked governor correctly', async () => {
        expect(await deployedContract.hasRole(timeLockedRole, timeLockedOwner.address)).to.be.true;
      });
      then('sets nft descriptor correctly', async () => {
        expect(await deployedContract.nftDescriptor()).to.equal(nftDescriptor.address);
      });
      then('sets oracle correctly', async () => {
        expect(await deployedContract.oracle()).to.equal(oracle.address);
      });
      then('contract starts as unpaused', async () => {
        expect(await deployedContract.paused()).to.be.false;
      });
    });
  });

  describe('setNFTDescriptor', () => {
    when('address is zero', () => {
      then('tx is reverted with reason', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAHubConfigHandler,
          func: 'setNFTDescriptor',
          args: [constants.ZERO_ADDRESS],
          message: 'ZeroAddress',
        });
      });
    });
    when('address is not zero', () => {
      then('sets nftDescriptor and emits event with correct arguments', async () => {
        await behaviours.txShouldSetVariableAndEmitEvent({
          contract: DCAHubConfigHandler,
          getterFunc: 'nftDescriptor',
          setterFunc: 'setNFTDescriptor',
          variable: constants.NOT_ZERO_ADDRESS,
          eventEmitted: 'NFTDescriptorSet',
        });
      });
    });

    behaviours.shouldBeExecutableOnlyByRole({
      contract: () => DCAHubConfigHandler,
      funcAndSignature: 'setNFTDescriptor(address)',
      params: [constants.NOT_ZERO_ADDRESS],
      addressWithRole: () => owner,
      role: () => immediateRole,
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
          variable: (await DCAHubConfigHandler.MAX_FEE()) - 1,
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
          variable: (await DCAHubConfigHandler.MAX_FEE()) - 1,
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
    when('one of the intervals is zero', () => {
      then('tx is reverted with reason', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAHubConfigHandler,
          func: 'addSwapIntervalsToAllowedList',
          args: [
            [0, 1],
            ['d1', 'd2'],
          ],
          message: 'ZeroInterval',
        });
        await behaviours.txShouldRevertWithMessage({
          contract: DCAHubConfigHandler,
          func: 'addSwapIntervalsToAllowedList',
          args: [
            [1, 0],
            ['d1', 'd2'],
          ],
          message: 'ZeroInterval',
        });
      });
    });
    when('one of the descriptions is empty', () => {
      then('tx is reverted with reason', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAHubConfigHandler,
          func: 'addSwapIntervalsToAllowedList',
          args: [
            [1, 10],
            ['', 'd2'],
          ],
          message: 'EmptyDescription',
        });
        await behaviours.txShouldRevertWithMessage({
          contract: DCAHubConfigHandler,
          func: 'addSwapIntervalsToAllowedList',
          args: [
            [1, 10],
            ['d1', ''],
          ],
          message: 'EmptyDescription',
        });
      });
    });
    when(`number of descriptions doesn't match number of intervals`, () => {
      then('tx is reverted with reason', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAHubConfigHandler,
          func: 'addSwapIntervalsToAllowedList',
          args: [[1], ['d1', 'd2']],
          message: 'InvalidParams',
        });
        await behaviours.txShouldRevertWithMessage({
          contract: DCAHubConfigHandler,
          func: 'addSwapIntervalsToAllowedList',
          args: [[1, 10], ['d1']],
          message: 'InvalidParams',
        });
      });
    });
    when('one of the intervals was already allowed', () => {
      beforeEach(async () => {
        await DCAHubConfigHandler.addSwapIntervalsToAllowedList([10, 11], ['something', 'something']);
      });
      then('tx is no op', async () => {
        await DCAHubConfigHandler.addSwapIntervalsToAllowedList([10, 11], ['something', 'something']);
      });
    });
    when('swap intervals are not zero and were not previously allowed', () => {
      then('adds swap intervals to allowed list and emits event', async () => {
        expect(await DCAHubConfigHandler.isSwapIntervalAllowed(1)).to.be.false;
        expect(await DCAHubConfigHandler.isSwapIntervalAllowed(100)).to.be.false;
        const intervalsToBeAdded = [1, 100];
        const descriptions = ['d1', 'd2'];
        await expect(DCAHubConfigHandler.addSwapIntervalsToAllowedList(intervalsToBeAdded, descriptions))
          .to.emit(DCAHubConfigHandler, 'SwapIntervalsAllowed')
          .withArgs(intervalsToBeAdded, descriptions);
        expect(await DCAHubConfigHandler.isSwapIntervalAllowed(1)).to.be.true;
        expect(await DCAHubConfigHandler.intervalDescription(1)).to.equal('d1');
        expect(await DCAHubConfigHandler.isSwapIntervalAllowed(100)).to.be.true;
        expect(await DCAHubConfigHandler.intervalDescription(100)).to.equal('d2');
      });
    });
    behaviours.shouldBeExecutableOnlyByRole({
      contract: () => DCAHubConfigHandler,
      funcAndSignature: 'addSwapIntervalsToAllowedList(uint32[],string[])',
      params: [[1], ['description']],
      addressWithRole: () => owner,
      role: () => immediateRole,
    });
  });
  describe('removeSwapIntervalsFromAllowedList', () => {
    beforeEach(async () => {
      await DCAHubConfigHandler.addSwapIntervalsToAllowedList([1], ['description']);
    });
    when('swap interval was not previously allowed', () => {
      then('tx is no op', async () => {
        await DCAHubConfigHandler.removeSwapIntervalsFromAllowedList([2]);
      });
    });
    when('swap interval was previously allowed and is removed', () => {
      let tx: TransactionResponse;

      given(async () => {
        tx = await DCAHubConfigHandler.removeSwapIntervalsFromAllowedList([1]);
      });

      then('event is emitted', async () => {
        await expect(tx).to.emit(DCAHubConfigHandler, 'SwapIntervalsForbidden').withArgs([1]);
      });
      then('interval is no longer allowed', async () => {
        expect(await DCAHubConfigHandler.isSwapIntervalAllowed(1)).to.be.false;
      });
      then('description is empty', async () => {
        expect(await DCAHubConfigHandler.intervalDescription(1)).to.be.empty;
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

  describe('allowedSwapIntervals', () => {
    when('no swap interval is allowed', () => {
      then('returns empty array', async () => {
        expect(await DCAHubConfigHandler.allowedSwapIntervals()).to.be.empty;
      });
    });
    when('there are swap intervals allowed', () => {
      const allowedIntervals = [1, 100, 200];
      const intervalDescriptions = ['d1', 'd2', 'd3'];
      given(async () => {
        await DCAHubConfigHandler.addSwapIntervalsToAllowedList(allowedIntervals, intervalDescriptions);
      });
      then('array returns correct intervals', async () => {
        bn.expectArraysToBeEqual(await DCAHubConfigHandler.allowedSwapIntervals(), allowedIntervals);
      });
    });
  });

  describe('isSwapIntervalAllowed', () => {
    when('querying for a swap interval not allowed', () => {
      then('returns false', async () => {
        expect(await DCAHubConfigHandler.isSwapIntervalAllowed(1240)).to.be.false;
      });
    });
    when('querying for an allowed swap interval', () => {
      const allowedInterval = 639;
      given(async () => {
        await DCAHubConfigHandler.addSwapIntervalsToAllowedList([allowedInterval], ['d1']);
      });
      then('returns true', async () => {
        expect(await DCAHubConfigHandler.isSwapIntervalAllowed(allowedInterval)).to.be.true;
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
