import { expect } from 'chai';
import { Contract, ContractFactory, Signer } from 'ethers';
import { ethers } from 'hardhat';
import { constants, behaviours } from '../../utils';

describe('DCAFactoryParameters', function () {
  let owner: Signer, feeRecipient: Signer;
  let DCAFactoryParametersContract: ContractFactory;
  let DCAFactoryParameters: Contract;

  before('Setup accounts and contracts', async () => {
    [owner, feeRecipient] = await ethers.getSigners();
    DCAFactoryParametersContract = await ethers.getContractFactory(
      'contracts/mocks/DCAFactory/DCAFactoryParameters.sol:DCAFactoryParametersMock'
    );
  });

  beforeEach('Deploy and configure', async () => {
    DCAFactoryParameters = await DCAFactoryParametersContract.deploy(
      await feeRecipient.getAddress()
    );
  });

  describe('constructor', () => {
    context('when feeRecipient is zero address', () => {
      it('reverts with message error', async () => {
        await behaviours.deployShouldRevertWithZeroAddress({
          contract: DCAFactoryParametersContract,
          args: [constants.ZERO_ADDRESS],
        });
      });
    });
    context('when all arguments are valid', () => {
      it('initizalizes correctly and emits events', async () => {
        await behaviours.deployShouldSetVariablesAndEmitEvents({
          contract: DCAFactoryParametersContract,
          args: [await feeRecipient.getAddress()],
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
    context('when address is zero', () => {
      it('reverts with message', async () => {
        await behaviours.txShouldRevertWithZeroAddress({
          contract: DCAFactoryParameters,
          func: 'setFeeRecipient',
          args: [constants.ZERO_ADDRESS],
        });
      });
    });
    context('when address is not zero', () => {
      it('sets feeRecipient and emits event with correct arguments', async () => {
        await behaviours.txShouldSetVariableAndEmitEvent({
          contract: DCAFactoryParameters,
          getterFunc: 'feeRecipient',
          setterFunc: 'setFeeRecipient',
          variable: constants.NOT_ZERO_ADDRESS,
          eventEmitted: 'FeeRecipientSet',
        });
      });
    });
  });

  describe('addSwapIntervalsToAllowedList', () => {
    context('when a swap interval is zero', () => {
      it('reverts with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAFactoryParameters,
          func: 'addSwapIntervalsToAllowedList',
          args: [[0, 1]],
          message: 'DCAFactory: zero-interval',
        });
        await behaviours.txShouldRevertWithMessage({
          contract: DCAFactoryParameters,
          func: 'addSwapIntervalsToAllowedList',
          args: [[1, 0]],
          message: 'DCAFactory: zero-interval',
        });
      });
    });
    context('when a swap interval was already allowed', () => {
      beforeEach(async () => {
        await DCAFactoryParameters.addSwapIntervalsToAllowedList([10, 11]);
      });
      it('reverts with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAFactoryParameters,
          func: 'addSwapIntervalsToAllowedList',
          args: [[1, 10]],
          message: 'DCAFactory: allowed-swap-interval',
        });
        await behaviours.txShouldRevertWithMessage({
          contract: DCAFactoryParameters,
          func: 'addSwapIntervalsToAllowedList',
          args: [[1, 11]],
          message: 'DCAFactory: allowed-swap-interval',
        });
        await behaviours.txShouldRevertWithMessage({
          contract: DCAFactoryParameters,
          func: 'addSwapIntervalsToAllowedList',
          args: [[10, 1]],
          message: 'DCAFactory: allowed-swap-interval',
        });
        await behaviours.txShouldRevertWithMessage({
          contract: DCAFactoryParameters,
          func: 'addSwapIntervalsToAllowedList',
          args: [[11, 1]],
          message: 'DCAFactory: allowed-swap-interval',
        });
      });
    });
    context(
      'when swap intervals are not zero and were not previously allowed',
      () => {
        it('adds swap intervals to allowed list and emits event', async () => {
          expect(await DCAFactoryParameters.isSwapIntervalAllowed(1)).to.be
            .false;
          expect(await DCAFactoryParameters.isSwapIntervalAllowed(100)).to.be
            .false;
          const intervalsToBeAdded = [1, 100];
          await expect(
            DCAFactoryParameters.addSwapIntervalsToAllowedList(
              intervalsToBeAdded
            )
          )
            .to.emit(DCAFactoryParameters, 'SwapIntervalsAllowed')
            .withArgs(intervalsToBeAdded);
          expect(await DCAFactoryParameters.isSwapIntervalAllowed(1)).to.be
            .true;
          expect(await DCAFactoryParameters.isSwapIntervalAllowed(100)).to.be
            .true;
        });
      }
    );
  });
  describe('removeSwapIntervalsFromAllowedList', () => {
    beforeEach(async () => {
      await DCAFactoryParameters.addSwapIntervalsToAllowedList([1]);
    });
    context('when swap interval was not previously allowed', () => {
      it('reverts with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAFactoryParameters,
          func: 'removeSwapIntervalsFromAllowedList',
          args: [[1, 2]],
          message: 'DCAFactory: swap-interval-not-allowed',
        });
        await behaviours.txShouldRevertWithMessage({
          contract: DCAFactoryParameters,
          func: 'removeSwapIntervalsFromAllowedList',
          args: [[2, 3]],
          message: 'DCAFactory: swap-interval-not-allowed',
        });
      });
    });
    context('when swap interval was previously allowed', () => {
      it('removes swap interval and emits event', async () => {
        expect(await DCAFactoryParameters.isSwapIntervalAllowed(1)).to.be.true;
        await expect(
          DCAFactoryParameters.removeSwapIntervalsFromAllowedList([1])
        )
          .to.emit(DCAFactoryParameters, 'SwapIntervalsForbidden')
          .withArgs([1]);
        expect(await DCAFactoryParameters.isSwapIntervalAllowed(1)).to.be.false;
      });
    });
  });
});
