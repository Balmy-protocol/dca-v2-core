import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { Contract, ContractFactory, Signer } from 'ethers';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { ethers } from 'hardhat';
import { constants, behaviours, bn } from '../../utils';
import { given, then, when } from '../../utils/bdd';

describe('DCAGlobalParameters', function () {
  let owner: SignerWithAddress, feeRecipient: Signer;
  let DCAGlobalParametersContract: ContractFactory;
  let DCAGlobalParameters: Contract;

  before('Setup accounts and contracts', async () => {
    [owner, feeRecipient] = await ethers.getSigners();
    DCAGlobalParametersContract = await ethers.getContractFactory(
      'contracts/mocks/DCAGlobalParameters/DCAGlobalParameters.sol:DCAGlobalParametersMock'
    );
  });

  beforeEach('Deploy and configure', async () => {
    DCAGlobalParameters = await DCAGlobalParametersContract.deploy(owner.address, await feeRecipient.getAddress());
  });

  describe('constructor', () => {
    when('feeRecipient is zero address', () => {
      then('tx is reverted with reason error', async () => {
        await behaviours.deployShouldRevertWithZeroAddress({
          contract: DCAGlobalParametersContract,
          args: [owner.address, constants.ZERO_ADDRESS],
        });
      });
    });
    when('all arguments are valid', () => {
      then('initializes correctly and emits events', async () => {
        await behaviours.deployShouldSetVariablesAndEmitEvents({
          contract: DCAGlobalParametersContract,
          args: [owner.address, await feeRecipient.getAddress()],
          settersGettersVariablesAndEvents: [
            {
              getterFunc: 'feeRecipient',
              variable: await feeRecipient.getAddress(),
              eventEmitted: 'FeeRecipientSet',
            },
          ],
        });
      });
    });
  });

  describe('setFeeRecipient', () => {
    when('address is zero', () => {
      then('tx is reverted with reason', async () => {
        await behaviours.txShouldRevertWithZeroAddress({
          contract: DCAGlobalParameters,
          func: 'setFeeRecipient',
          args: [constants.ZERO_ADDRESS],
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

  describe('setFee', () => {
    when('sets fee bigger than MAX_FEE', () => {
      then('tx is reverted with reason', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAGlobalParameters,
          func: 'setFee',
          args: [(await DCAGlobalParameters.MAX_FEE()) + 1],
          message: 'DCAGParameters: fee too high',
        });
      });
    });
    when('sets fee equal to MAX_FEE', () => {
      then('sets fee and emits event', async () => {
        await behaviours.txShouldSetVariableAndEmitEvent({
          contract: DCAGlobalParameters,
          getterFunc: 'fee',
          setterFunc: 'setFee',
          variable: await DCAGlobalParameters.MAX_FEE(),
          eventEmitted: 'FeeSet',
        });
      });
    });
    when('sets fee lower to MAX_FEE', () => {
      then('sets fee and emits event', async () => {
        await behaviours.txShouldSetVariableAndEmitEvent({
          contract: DCAGlobalParameters,
          getterFunc: 'fee',
          setterFunc: 'setFee',
          variable: (await DCAGlobalParameters.MAX_FEE()) - 1,
          eventEmitted: 'FeeSet',
        });
      });
    });
    behaviours.shouldBeExecutableOnlyByGovernor({
      contract: () => DCAGlobalParameters,
      funcAndSignature: 'setFee(uint32)',
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
          message: 'DCAGParameters: zero interval',
        });
        await behaviours.txShouldRevertWithMessage({
          contract: DCAGlobalParameters,
          func: 'addSwapIntervalsToAllowedList',
          args: [
            [1, 0],
            ['d1', 'd2'],
          ],
          message: 'DCAGParameters: zero interval',
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
          message: 'DCAGParameters: empty text',
        });
        await behaviours.txShouldRevertWithMessage({
          contract: DCAGlobalParameters,
          func: 'addSwapIntervalsToAllowedList',
          args: [
            [1, 10],
            ['d1', ''],
          ],
          message: 'DCAGParameters: empty text',
        });
      });
    });
    when(`number of descriptions doesn't match number of intervals`, () => {
      then('tx is reverted with reason', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAGlobalParameters,
          func: 'addSwapIntervalsToAllowedList',
          args: [[1], ['d1', 'd2']],
          message: 'DCAGParameters: invalid params',
        });
        await behaviours.txShouldRevertWithMessage({
          contract: DCAGlobalParameters,
          func: 'addSwapIntervalsToAllowedList',
          args: [[1, 10], ['d1']],
          message: 'DCAGParameters: invalid params',
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
          message: 'DCAGParameters: already allowed',
        });
        await behaviours.txShouldRevertWithMessage({
          contract: DCAGlobalParameters,
          func: 'addSwapIntervalsToAllowedList',
          args: [
            [1, 11],
            ['d1', 'd2'],
          ],
          message: 'DCAGParameters: already allowed',
        });
        await behaviours.txShouldRevertWithMessage({
          contract: DCAGlobalParameters,
          func: 'addSwapIntervalsToAllowedList',
          args: [
            [10, 1],
            ['d1', 'd2'],
          ],
          message: 'DCAGParameters: already allowed',
        });
        await behaviours.txShouldRevertWithMessage({
          contract: DCAGlobalParameters,
          func: 'addSwapIntervalsToAllowedList',
          args: [
            [11, 1],
            ['d1', 'd2'],
          ],
          message: 'DCAGParameters: already allowed',
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
          message: 'DCAGParameters: invalid interval',
        });
        await behaviours.txShouldRevertWithMessage({
          contract: DCAGlobalParameters,
          func: 'removeSwapIntervalsFromAllowedList',
          args: [[2, 3]],
          message: 'DCAGParameters: invalid interval',
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
});
