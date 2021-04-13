import { expect } from 'chai';
import { BigNumber, Contract, ContractFactory, Signer, utils } from 'ethers';
import { ethers } from 'hardhat';
import { constants, erc20, behaviours, bn } from '../../utils';

import { given, then, when } from '../../utils/bdd';

describe('DCAPairParameters', function () {
  let owner: Signer;
  let tokenA: Contract, tokenB: Contract;
  let DCAPairParametersContract: ContractFactory;
  let DCAPairParameters: Contract;

  before('Setup accounts and contracts', async () => {
    [owner] = await ethers.getSigners();
    DCAPairParametersContract = await ethers.getContractFactory(
      'contracts/mocks/DCAPair/DCAPairParameters.sol:DCAPairParametersMock'
    );
  });

  beforeEach('Deploy and configure', async () => {
    tokenA = await erc20.deploy({
      name: 'DAI',
      symbol: 'DAI',
      initialAccount: await owner.getAddress(),
      initialAmount: utils.parseEther('1'),
    });
    tokenB = await erc20.deploy({
      name: 'DAI',
      symbol: 'DAI',
      initialAccount: await owner.getAddress(),
      initialAmount: utils.parseEther('1'),
    });
    DCAPairParameters = await DCAPairParametersContract.deploy(
      tokenA.address,
      tokenB.address
    );
  });

  describe('constructor', () => {
    context('when from is zero address', () => {
      it('reverts with message error', async () => {
        await behaviours.deployShouldRevertWithZeroAddress({
          contract: DCAPairParametersContract,
          args: [constants.ZERO_ADDRESS, tokenB.address],
        });
      });
    });
    context('when to is zero address', () => {
      it('reverts with message error', async () => {
        await behaviours.deployShouldRevertWithZeroAddress({
          contract: DCAPairParametersContract,
          args: [tokenA.address, constants.ZERO_ADDRESS],
        });
      });
    });
    context('when all arguments are valid', () => {
      it('initizalizes correctly and emits events', async () => {
        await behaviours.deployShouldSetVariablesAndEmitEvents({
          contract: DCAPairParametersContract,
          args: [tokenA.address, tokenB.address],
          settersGettersVariablesAndEvents: [
            {
              getterFunc: 'tokenA',
              variable: tokenA.address,
              eventEmitted: 'TokenASet',
            },
            {
              getterFunc: 'tokenB',
              variable: tokenB.address,
              eventEmitted: 'TokenBSet',
            },
          ],
        });
      });
    });
  });

  describe('setFactory', () => {
    context('when address is zero', () => {
      it('reverts with message', async () => {
        await behaviours.txShouldRevertWithZeroAddress({
          contract: DCAPairParameters,
          func: 'setFactory',
          args: [constants.ZERO_ADDRESS],
        });
      });
    });
    context('when address is not zero', () => {
      it('sets factory and emits event with correct arguments', async () => {
        await behaviours.txShouldSetVariableAndEmitEvent({
          contract: DCAPairParameters,
          getterFunc: 'factory',
          setterFunc: 'setFactory',
          variable: constants.NOT_ZERO_ADDRESS,
          eventEmitted: 'FactorySet',
        });
      });
    });
  });

  describe('setTokenA', () => {
    context('when address is zero', () => {
      it('reverts with message', async () => {
        await behaviours.txShouldRevertWithZeroAddress({
          contract: DCAPairParameters,
          func: 'setTokenA',
          args: [constants.ZERO_ADDRESS],
        });
      });
    });
    context('when address is not zero', () => {
      it('sets from and emits event with correct arguments', async () => {
        await behaviours.txShouldSetVariableAndEmitEvent({
          contract: DCAPairParameters,
          getterFunc: 'tokenA',
          setterFunc: 'setTokenA',
          variable: constants.NOT_ZERO_ADDRESS,
          eventEmitted: 'TokenASet',
        });
      });
    });
  });

  describe('setTokenB', () => {
    context('when address is zero', () => {
      it('reverts with message', async () => {
        await behaviours.txShouldRevertWithZeroAddress({
          contract: DCAPairParameters,
          func: 'setTokenB',
          args: [constants.ZERO_ADDRESS],
        });
      });
    });
    context('when address is not zero', () => {
      let newTo: Contract;
      beforeEach(async () => {
        newTo = await erc20.deploy({
          name: 'DAI',
          symbol: 'DAI',
          initialAccount: await owner.getAddress(),
          initialAmount: utils.parseEther('1'),
        });
      });
      it('sets to and emits event with correct arguments', async () => {
        await behaviours.txShouldSetVariableAndEmitEvent({
          contract: DCAPairParameters,
          getterFunc: 'tokenB',
          setterFunc: 'setTokenB',
          variable: newTo.address,
          eventEmitted: 'TokenBSet',
        });
      });
    });
  });
});
