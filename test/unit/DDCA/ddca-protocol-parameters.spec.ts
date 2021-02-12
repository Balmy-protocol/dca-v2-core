import { expect } from 'chai';
import { Contract, ContractFactory, Signer, utils } from 'ethers';
import { ethers } from 'hardhat';
import { constants, uniswap, erc20, behaviours } from '../../utils';

describe('DDCAProtocolParameters', function () {
  let owner: Signer, feeRecipient: Signer;
  let fromToken: Contract, toToken: Contract;
  let DDCAProtocolParametersContract: ContractFactory,
    DDCAProtocolParameters: Contract;

  before('Setup accounts and contracts', async () => {
    [owner, feeRecipient] = await ethers.getSigners();
    DDCAProtocolParametersContract = await ethers.getContractFactory(
      'contracts/mocks/DDCA/DDCAProtocolParameters.sol:DDCAProtocolParametersMock'
    );
  });

  beforeEach('Deploy and configure', async () => {
    await uniswap.deploy({
      owner,
    });
    fromToken = await erc20.deploy({
      name: 'DAI',
      symbol: 'DAI',
      initialAccount: await owner.getAddress(),
      initialAmount: utils.parseEther('1'),
    });
    toToken = await erc20.deploy({
      name: 'DAI2',
      symbol: 'DAI2',
      initialAccount: await owner.getAddress(),
      initialAmount: utils.parseEther('1'),
    });
    DDCAProtocolParameters = await DDCAProtocolParametersContract.deploy(
      await feeRecipient.getAddress(),
      fromToken.address,
      uniswap.getWETH().address,
      uniswap.getUniswapV2Router02().address
    );
  });

  describe('constructor', () => {
    context('when from is zero address', () => {
      it('reverts with message error');
    });
    context('when to is zero address', () => {
      it('reverts with message error');
    });
    context('when uniswap is zero address', () => {
      it('reverts with message error');
    });
    context('when all arguments are valid', () => {
      it('initizalizes correctly and emits events');
    });
  });

  describe('setFeeRecipient', () => {
    context('when address is zero', () => {
      it('reverts with message', async () => {
        await behaviours.shouldRevertWithZeroAddress({
          contract: DDCAProtocolParameters,
          func: 'setFeeRecipient',
          args: [constants.ZERO_ADDRESS],
        });
      });
    });
    context('when address is not zero', () => {
      it('sets feeRecipient and emits event with correct arguments', async () => {
        await behaviours.shouldSetVariableAndEmitEvent({
          contract: DDCAProtocolParameters,
          getterFunc: 'feeRecipient',
          setterFunc: 'setFeeRecipient',
          variable: constants.NOT_ZERO_ADDRESS,
          eventEmitted: 'FeeRecipientSet',
        });
      });
    });
  });

  describe('setFrom', () => {
    context('when address is zero', () => {
      it('reverts with message', async () => {
        await behaviours.shouldRevertWithZeroAddress({
          contract: DDCAProtocolParameters,
          func: 'setFrom',
          args: [constants.ZERO_ADDRESS],
        });
      });
    });
    context('when address is not zero', () => {
      it('sets from and emits event with correct arguments', async () => {
        await behaviours.shouldSetVariableAndEmitEvent({
          contract: DDCAProtocolParameters,
          getterFunc: 'from',
          setterFunc: 'setFrom',
          variable: constants.NOT_ZERO_ADDRESS,
          eventEmitted: 'FromSet',
        });
      });
    });
  });

  describe('setTo', () => {
    context('when address is zero', () => {
      it('reverts with message', async () => {
        await behaviours.shouldRevertWithZeroAddress({
          contract: DDCAProtocolParameters,
          func: 'setTo',
          args: [constants.ZERO_ADDRESS],
        });
      });
    });
    context('when address is not zero', () => {
      it('sets to and emits event with correct arguments', async () => {
        await behaviours.shouldSetVariableAndEmitEvent({
          contract: DDCAProtocolParameters,
          getterFunc: 'to',
          setterFunc: 'setTo',
          variable: constants.NOT_ZERO_ADDRESS,
          eventEmitted: 'ToSet',
        });
      });
    });
  });

  describe('setUniswap', () => {
    context('when address is zero', () => {
      it('reverts with message', async () => {
        await behaviours.shouldRevertWithZeroAddress({
          contract: DDCAProtocolParameters,
          func: 'setUniswap',
          args: [constants.ZERO_ADDRESS],
        });
      });
    });
    context('when address is not zero', () => {
      it('sets uniswap and emits event with correct arguments', async () => {
        await behaviours.shouldSetVariableAndEmitEvent({
          contract: DDCAProtocolParameters,
          getterFunc: 'uniswap',
          setterFunc: 'setUniswap',
          variable: constants.NOT_ZERO_ADDRESS,
          eventEmitted: 'UniswapSet',
        });
      });
    });
  });
});
