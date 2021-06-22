import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { Contract, ContractFactory, Signer } from 'ethers';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { ethers } from 'hardhat';
import { constants, behaviours, bn, contracts } from '../../utils';
import { given, then, when } from '../../utils/bdd';

describe('DCAGlobalParameters', () => {
  let owner: SignerWithAddress, feeRecipient: SignerWithAddress, nftDescriptor: SignerWithAddress;
  let DCAGlobalParametersContract: ContractFactory;
  let DCAGlobalParameters: Contract;

  before('Setup accounts and contracts', async () => {
    [owner, feeRecipient, nftDescriptor] = await ethers.getSigners();
    DCAGlobalParametersContract = await ethers.getContractFactory(
      'contracts/mocks/DCAGlobalParameters/DCAGlobalParameters.sol:DCAGlobalParametersMock'
    );
  });

  beforeEach('Deploy and configure', async () => {
    DCAGlobalParameters = await DCAGlobalParametersContract.deploy(owner.address, feeRecipient.address, nftDescriptor.address);
  });

  describe('constructor', () => {
    when('feeRecipient is zero address', () => {
      then('tx is reverted with reason error', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: DCAGlobalParametersContract,
          args: [owner.address, constants.ZERO_ADDRESS, constants.NOT_ZERO_ADDRESS],
          message: 'ZeroAddress',
        });
      });
    });
    when('feeRecipient is zero address', () => {
      then('tx is reverted with reason error', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: DCAGlobalParametersContract,
          args: [owner.address, constants.NOT_ZERO_ADDRESS, constants.ZERO_ADDRESS],
          message: 'ZeroAddress',
        });
      });
    });
    when('all arguments are valid', () => {
      let deployedContract: Contract;
      given(async () => {
        const deployment = await contracts.deploy(DCAGlobalParametersContract, [owner.address, feeRecipient.address, nftDescriptor.address]);
        deployedContract = deployment.contract;
      });
      then('sets governor correctly', async () => {
        expect(await deployedContract.governor()).to.equal(owner.address);
      });
      then('sets fee recipient correctly', async () => {
        expect(await deployedContract.feeRecipient()).to.equal(feeRecipient.address);
      });
      then('sets nft descriptor correctly', async () => {
        expect(await deployedContract.nftDescriptor()).to.equal(nftDescriptor.address);
      });
      then('contract starts as unpaused', async () => {
        expect(await deployedContract.paused()).to.be.false;
      });
    });
  });

  describe('setFeeRecipient', () => {
    when('address is zero', () => {
      then('tx is reverted with reason', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAGlobalParameters,
          func: 'setFeeRecipient',
          args: [constants.ZERO_ADDRESS],
          message: 'ZeroAddress',
        });
      });
    });
    when('address is not zero', () => {
      then('sets feeRecipient and emits event with correct arguments', async () => {
        await behaviours.txShouldSetVariableAndEmitEvent({
          contract: DCAGlobalParameters,
          getterFunc: 'feeRecipient',
          setterFunc: 'setFeeRecipient',
          variable: constants.NOT_ZERO_ADDRESS,
          eventEmitted: 'FeeRecipientSet',
        });
      });
    });

    behaviours.shouldBeExecutableOnlyByGovernor({
      contract: () => DCAGlobalParameters,
      funcAndSignature: 'setFeeRecipient(address)',
      params: [constants.NOT_ZERO_ADDRESS],
      governor: () => owner,
    });
  });

  describe('setNFTDescriptor', () => {
    when('address is zero', () => {
      then('tx is reverted with reason', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAGlobalParameters,
          func: 'setNFTDescriptor',
          args: [constants.ZERO_ADDRESS],
          message: 'ZeroAddress',
        });
      });
    });
    when('address is not zero', () => {
      then('sets nftDescriptor and emits event with correct arguments', async () => {
        await behaviours.txShouldSetVariableAndEmitEvent({
          contract: DCAGlobalParameters,
          getterFunc: 'nftDescriptor',
          setterFunc: 'setNFTDescriptor',
          variable: constants.NOT_ZERO_ADDRESS,
          eventEmitted: 'NFTDescriptorSet',
        });
      });
    });

    behaviours.shouldBeExecutableOnlyByGovernor({
      contract: () => DCAGlobalParameters,
      funcAndSignature: 'setNFTDescriptor(address)',
      params: [constants.NOT_ZERO_ADDRESS],
      governor: () => owner,
    });
  });

  describe('setSwapFee', () => {
    when('sets fee bigger than MAX_FEE', () => {
      then('tx is reverted with reason', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAGlobalParameters,
          func: 'setSwapFee',
          args: [(await DCAGlobalParameters.MAX_FEE()) + 1],
          message: 'HighFee',
        });
      });
    });
    when('sets fee equal to MAX_FEE', () => {
      then('sets fee and emits event', async () => {
        await behaviours.txShouldSetVariableAndEmitEvent({
          contract: DCAGlobalParameters,
          getterFunc: 'swapFee',
          setterFunc: 'setSwapFee',
          variable: await DCAGlobalParameters.MAX_FEE(),
          eventEmitted: 'SwapFeeSet',
        });
      });
    });
    when('sets fee lower to MAX_FEE', () => {
      then('sets fee and emits event', async () => {
        await behaviours.txShouldSetVariableAndEmitEvent({
          contract: DCAGlobalParameters,
          getterFunc: 'swapFee',
          setterFunc: 'setSwapFee',
          variable: (await DCAGlobalParameters.MAX_FEE()) - 1,
          eventEmitted: 'SwapFeeSet',
        });
      });
    });
    behaviours.shouldBeExecutableOnlyByGovernor({
      contract: () => DCAGlobalParameters,
      funcAndSignature: 'setSwapFee(uint32)',
      params: [1],
      governor: () => owner,
    });
  });

  describe('setLoanFee', () => {
    when('sets fee bigger than MAX_FEE', () => {
      then('tx is reverted with reason', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAGlobalParameters,
          func: 'setLoanFee',
          args: [(await DCAGlobalParameters.MAX_FEE()) + 1],
          message: 'HighFee',
        });
      });
    });
    when('sets fee equal to MAX_FEE', () => {
      then('sets fee and emits event', async () => {
        await behaviours.txShouldSetVariableAndEmitEvent({
          contract: DCAGlobalParameters,
          getterFunc: 'loanFee',
          setterFunc: 'setLoanFee',
          variable: await DCAGlobalParameters.MAX_FEE(),
          eventEmitted: 'LoanFeeSet',
        });
      });
    });
    when('sets fee lower to MAX_FEE', () => {
      then('sets fee and emits event', async () => {
        await behaviours.txShouldSetVariableAndEmitEvent({
          contract: DCAGlobalParameters,
          getterFunc: 'loanFee',
          setterFunc: 'setLoanFee',
          variable: (await DCAGlobalParameters.MAX_FEE()) - 1,
          eventEmitted: 'LoanFeeSet',
        });
      });
    });
    behaviours.shouldBeExecutableOnlyByGovernor({
      contract: () => DCAGlobalParameters,
      funcAndSignature: 'setLoanFee(uint32)',
      params: [1],
      governor: () => owner,
    });
  });

  describe('addSwapIntervalsToAllowedList', () => {
    when('one of the intervals is zero', () => {
      then('tx is reverted with reason', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAGlobalParameters,
          func: 'addSwapIntervalsToAllowedList',
          args: [
            [0, 1],
            ['d1', 'd2'],
          ],
          message: 'ZeroInterval',
        });
        await behaviours.txShouldRevertWithMessage({
          contract: DCAGlobalParameters,
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
          contract: DCAGlobalParameters,
          func: 'addSwapIntervalsToAllowedList',
          args: [
            [1, 10],
            ['', 'd2'],
          ],
          message: 'EmptyDescription',
        });
        await behaviours.txShouldRevertWithMessage({
          contract: DCAGlobalParameters,
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
          contract: DCAGlobalParameters,
          func: 'addSwapIntervalsToAllowedList',
          args: [[1], ['d1', 'd2']],
          message: 'InvalidParams',
        });
        await behaviours.txShouldRevertWithMessage({
          contract: DCAGlobalParameters,
          func: 'addSwapIntervalsToAllowedList',
          args: [[1, 10], ['d1']],
          message: 'InvalidParams',
        });
      });
    });
    when('one of the intervals was already allowed', () => {
      beforeEach(async () => {
        await DCAGlobalParameters.addSwapIntervalsToAllowedList([10, 11], ['something', 'something']);
      });
      then('tx is reverted with reason', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAGlobalParameters,
          func: 'addSwapIntervalsToAllowedList',
          args: [
            [1, 10],
            ['d1', 'd2'],
          ],
          message: 'AllowedInterval',
        });
        await behaviours.txShouldRevertWithMessage({
          contract: DCAGlobalParameters,
          func: 'addSwapIntervalsToAllowedList',
          args: [
            [1, 11],
            ['d1', 'd2'],
          ],
          message: 'AllowedInterval',
        });
        await behaviours.txShouldRevertWithMessage({
          contract: DCAGlobalParameters,
          func: 'addSwapIntervalsToAllowedList',
          args: [
            [10, 1],
            ['d1', 'd2'],
          ],
          message: 'AllowedInterval',
        });
        await behaviours.txShouldRevertWithMessage({
          contract: DCAGlobalParameters,
          func: 'addSwapIntervalsToAllowedList',
          args: [
            [11, 1],
            ['d1', 'd2'],
          ],
          message: 'AllowedInterval',
        });
      });
    });
    when('swap intervals are not zero and were not previously allowed', () => {
      then('adds swap intervals to allowed list and emits event', async () => {
        expect(await DCAGlobalParameters.isSwapIntervalAllowed(1)).to.be.false;
        expect(await DCAGlobalParameters.isSwapIntervalAllowed(100)).to.be.false;
        const intervalsToBeAdded = [1, 100];
        const descriptions = ['d1', 'd2'];
        await expect(DCAGlobalParameters.addSwapIntervalsToAllowedList(intervalsToBeAdded, descriptions))
          .to.emit(DCAGlobalParameters, 'SwapIntervalsAllowed')
          .withArgs(intervalsToBeAdded, descriptions);
        expect(await DCAGlobalParameters.isSwapIntervalAllowed(1)).to.be.true;
        expect(await DCAGlobalParameters.intervalDescription(1)).to.equal('d1');
        expect(await DCAGlobalParameters.isSwapIntervalAllowed(100)).to.be.true;
        expect(await DCAGlobalParameters.intervalDescription(100)).to.equal('d2');
      });
    });
    behaviours.shouldBeExecutableOnlyByGovernor({
      contract: () => DCAGlobalParameters,
      funcAndSignature: 'addSwapIntervalsToAllowedList(uint32[],string[])',
      params: [[1], ['description']],
      governor: () => owner,
    });
  });
  describe('removeSwapIntervalsFromAllowedList', () => {
    beforeEach(async () => {
      await DCAGlobalParameters.addSwapIntervalsToAllowedList([1], ['description']);
    });
    when('swap interval was not previously allowed', () => {
      then('tx is reverted with reason', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAGlobalParameters,
          func: 'removeSwapIntervalsFromAllowedList',
          args: [[1, 2]],
          message: 'InvalidInterval',
        });
        await behaviours.txShouldRevertWithMessage({
          contract: DCAGlobalParameters,
          func: 'removeSwapIntervalsFromAllowedList',
          args: [[2, 3]],
          message: 'InvalidInterval',
        });
      });
    });
    when('swap interval was previously allowed and is removed', () => {
      let tx: TransactionResponse;

      given(async () => {
        tx = await DCAGlobalParameters.removeSwapIntervalsFromAllowedList([1]);
      });

      then('event is emitted', async () => {
        await expect(tx).to.emit(DCAGlobalParameters, 'SwapIntervalsForbidden').withArgs([1]);
      });
      then('interval is no longer allowed', async () => {
        expect(await DCAGlobalParameters.isSwapIntervalAllowed(1)).to.be.false;
      });
      then('description is empty', async () => {
        expect(await DCAGlobalParameters.intervalDescription(1)).to.be.empty;
      });
    });
    behaviours.shouldBeExecutableOnlyByGovernor({
      contract: () => DCAGlobalParameters,
      funcAndSignature: 'removeSwapIntervalsFromAllowedList(uint32[])',
      params: [[1]],
      governor: () => owner,
    });
  });

  describe('allowedSwapIntervals', () => {
    when('no swap interval is allowed', () => {
      then('returns empty array', async () => {
        expect(await DCAGlobalParameters.allowedSwapIntervals()).to.be.empty;
      });
    });
    when('there are swap intervals allowed', () => {
      const allowedIntervals = [1, 100, 200];
      const intervalDescriptions = ['d1', 'd2', 'd3'];
      given(async () => {
        await DCAGlobalParameters.addSwapIntervalsToAllowedList(allowedIntervals, intervalDescriptions);
      });
      then('array returns correct intervals', async () => {
        bn.expectArraysToBeEqual(await DCAGlobalParameters.allowedSwapIntervals(), allowedIntervals);
      });
    });
  });

  describe('isSwapIntervalAllowed', () => {
    when('querying for a swap interval not allowed', () => {
      then('returns false', async () => {
        expect(await DCAGlobalParameters.isSwapIntervalAllowed(1240)).to.be.false;
      });
    });
    when('querying for an allowed swap interval', () => {
      const allowedInterval = 639;
      given(async () => {
        await DCAGlobalParameters.addSwapIntervalsToAllowedList([allowedInterval], ['d1']);
      });
      then('returns true', async () => {
        expect(await DCAGlobalParameters.isSwapIntervalAllowed(allowedInterval)).to.be.true;
      });
    });
  });

  describe('pause', () => {
    when('contract is paused', () => {
      let tx: TransactionResponse;

      given(async () => {
        tx = await DCAGlobalParameters.pause();
      });

      then('getter says so', async () => {
        expect(await DCAGlobalParameters.paused()).to.be.true;
      });

      then('attempts to pause it again will revert', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAGlobalParameters,
          func: 'pause',
          args: [],
          message: 'Pausable: paused',
        });
      });

      then('event is emitted', async () => {
        await expect(tx).to.emit(DCAGlobalParameters, 'Paused');
      });
    });

    behaviours.shouldBeExecutableOnlyByGovernor({
      contract: () => DCAGlobalParameters,
      funcAndSignature: 'pause()',
      params: [],
      governor: () => owner,
    });
  });

  describe('unpause', () => {
    given(async () => {
      await DCAGlobalParameters.pause();
    });

    when('contract is unpaused', () => {
      let tx: TransactionResponse;

      given(async () => {
        tx = await DCAGlobalParameters.unpause();
      });

      then('getter says so', async () => {
        expect(await DCAGlobalParameters.paused()).to.be.false;
      });

      then('attempts to unpause it again will revert', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAGlobalParameters,
          func: 'unpause',
          args: [],
          message: 'Pausable: not paused',
        });
      });

      then('event is emitted', async () => {
        await expect(tx).to.emit(DCAGlobalParameters, 'Unpaused');
      });
    });

    behaviours.shouldBeExecutableOnlyByGovernor({
      contract: () => DCAGlobalParameters,
      funcAndSignature: 'unpause()',
      params: [],
      governor: () => owner,
    });
  });
});
