import { expect } from 'chai';
import { Contract, ContractFactory, Signer, utils } from 'ethers';
import { ethers } from 'hardhat';
import { constants, uniswap, erc20, behaviours } from '../../utils';

describe('DCAProtocolParameters', function () {
  let owner: Signer, feeRecipient: Signer;
  let fromToken: Contract;
  let DCAProtocolParametersContract: ContractFactory;
  let DCAProtocolParameters: Contract;

  before('Setup accounts and contracts', async () => {
    [owner, feeRecipient] = await ethers.getSigners();
    DCAProtocolParametersContract = await ethers.getContractFactory(
      'contracts/mocks/DCA/DCAProtocolParameters.sol:DCAProtocolParametersMock'
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
    DCAProtocolParameters = await DCAProtocolParametersContract.deploy(
      await feeRecipient.getAddress(),
      fromToken.address,
      uniswap.getWETH().address,
      uniswap.getUniswapV2Router02().address
    );
  });

  describe('constructor', () => {
    context('when feeRecipient is zero address', () => {
      it('reverts with message error', async () => {
        await behaviours.deployShouldRevertWithZeroAddress({
          contract: DCAProtocolParametersContract,
          args: [
            constants.ZERO_ADDRESS,
            fromToken.address,
            uniswap.getWETH().address,
            uniswap.getUniswapV2Router02().address,
          ],
        });
      });
    });
    context('when from is zero address', () => {
      it('reverts with message error', async () => {
        await behaviours.deployShouldRevertWithZeroAddress({
          contract: DCAProtocolParametersContract,
          args: [
            await feeRecipient.getAddress(),
            constants.ZERO_ADDRESS,
            uniswap.getWETH().address,
            uniswap.getUniswapV2Router02().address,
          ],
        });
      });
    });
    context('when to is zero address', () => {
      it('reverts with message error', async () => {
        await behaviours.deployShouldRevertWithZeroAddress({
          contract: DCAProtocolParametersContract,
          args: [
            await feeRecipient.getAddress(),
            fromToken.address,
            constants.ZERO_ADDRESS,
            uniswap.getUniswapV2Router02().address,
          ],
        });
      });
    });
    context('when uniswap is zero address', () => {
      it('reverts with message error', async () => {
        await behaviours.deployShouldRevertWithZeroAddress({
          contract: DCAProtocolParametersContract,
          args: [
            await feeRecipient.getAddress(),
            fromToken.address,
            uniswap.getWETH().address,
            constants.ZERO_ADDRESS,
          ],
        });
      });
    });
    context('when all arguments are valid', () => {
      it('initizalizes correctly and emits events', async () => {
        await behaviours.deployShouldSetVariablesAndEmitEvents({
          contract: DCAProtocolParametersContract,
          args: [
            await feeRecipient.getAddress(),
            fromToken.address,
            uniswap.getWETH().address,
            uniswap.getUniswapV2Router02().address,
          ],
          settersGettersVariablesAndEvents: [
            {
              getterFunc: 'feeRecipient',
              variable: await feeRecipient.getAddress(),
              eventEmitted: 'FeeRecipientSet',
            },
            {
              getterFunc: 'from',
              variable: fromToken.address,
              eventEmitted: 'FromSet',
            },
            {
              getterFunc: 'to',
              variable: uniswap.getWETH().address,
              eventEmitted: 'ToSet',
            },
            {
              getterFunc: 'uniswap',
              variable: uniswap.getUniswapV2Router02().address,
              eventEmitted: 'UniswapSet',
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
          contract: DCAProtocolParameters,
          func: 'setFeeRecipient',
          args: [constants.ZERO_ADDRESS],
        });
      });
    });
    context('when address is not zero', () => {
      it('sets feeRecipient and emits event with correct arguments', async () => {
        await behaviours.txShouldSetVariableAndEmitEvent({
          contract: DCAProtocolParameters,
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
        await behaviours.txShouldRevertWithZeroAddress({
          contract: DCAProtocolParameters,
          func: 'setFrom',
          args: [constants.ZERO_ADDRESS],
        });
      });
    });
    context('when address is not zero', () => {
      it('sets from and emits event with correct arguments', async () => {
        await behaviours.txShouldSetVariableAndEmitEvent({
          contract: DCAProtocolParameters,
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
        await behaviours.txShouldRevertWithZeroAddress({
          contract: DCAProtocolParameters,
          func: 'setTo',
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
        const previousMagnitude = ethers.BigNumber.from(10).pow(
          await uniswap.getWETH().decimals()
        );
        expect(await DCAProtocolParameters.magnitude()).to.equal(
          previousMagnitude
        );
        await behaviours.txShouldSetVariableAndEmitEvent({
          contract: DCAProtocolParameters,
          getterFunc: 'to',
          setterFunc: 'setTo',
          variable: newTo.address,
          eventEmitted: 'ToSet',
        });
        const postMagnitude = ethers.BigNumber.from(10).pow(
          await newTo.decimals()
        );
        expect(await DCAProtocolParameters.magnitude()).to.equal(postMagnitude);
      });
    });
  });

  describe('setUniswap', () => {
    context('when address is zero', () => {
      it('reverts with message', async () => {
        await behaviours.txShouldRevertWithZeroAddress({
          contract: DCAProtocolParameters,
          func: 'setUniswap',
          args: [constants.ZERO_ADDRESS],
        });
      });
    });
    context('when address is not zero', () => {
      it('sets uniswap and emits event with correct arguments', async () => {
        await behaviours.txShouldSetVariableAndEmitEvent({
          contract: DCAProtocolParameters,
          getterFunc: 'uniswap',
          setterFunc: 'setUniswap',
          variable: constants.NOT_ZERO_ADDRESS,
          eventEmitted: 'UniswapSet',
        });
      });
    });
  });
});
