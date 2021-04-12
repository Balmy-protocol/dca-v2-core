import { expect } from 'chai';
import { Contract, ContractFactory, Signer, utils } from 'ethers';
import { ethers } from 'hardhat';
import { constants, uniswap, erc20, behaviours } from '../../utils';
import { then, when } from '../../utils/bdd';

describe('DCAPairParameters', function () {
  let owner: Signer;
  let tokenA: Contract;
  let DCAPairParametersContract: ContractFactory;
  let DCAPairParameters: Contract;

  before('Setup accounts and contracts', async () => {
    [owner] = await ethers.getSigners();
    DCAPairParametersContract = await ethers.getContractFactory(
      'contracts/mocks/DCAPair/DCAPairParameters.sol:DCAPairParametersMock'
    );
  });

  beforeEach('Deploy and configure', async () => {
    await uniswap.deploy({
      owner,
    });
    tokenA = await erc20.deploy({
      name: 'DAI',
      symbol: 'DAI',
      initialAccount: await owner.getAddress(),
      initialAmount: utils.parseEther('1'),
    });
    DCAPairParameters = await DCAPairParametersContract.deploy(
      tokenA.address,
      uniswap.getWETH().address,
      uniswap.getUniswapV2Router02().address
    );
  });

  describe('constructor', () => {
    context('when from is zero address', () => {
      it('reverts with message error', async () => {
        await behaviours.deployShouldRevertWithZeroAddress({
          contract: DCAPairParametersContract,
          args: [
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
          contract: DCAPairParametersContract,
          args: [
            tokenA.address,
            constants.ZERO_ADDRESS,
            uniswap.getUniswapV2Router02().address,
          ],
        });
      });
    });
    context('when uniswap is zero address', () => {
      it('reverts with message error', async () => {
        await behaviours.deployShouldRevertWithZeroAddress({
          contract: DCAPairParametersContract,
          args: [
            tokenA.address,
            uniswap.getWETH().address,
            constants.ZERO_ADDRESS,
          ],
        });
      });
    });
    context('when all arguments are valid', () => {
      it('initizalizes correctly and emits events', async () => {
        await behaviours.deployShouldSetVariablesAndEmitEvents({
          contract: DCAPairParametersContract,
          args: [
            tokenA.address,
            uniswap.getWETH().address,
            uniswap.getUniswapV2Router02().address,
          ],
          settersGettersVariablesAndEvents: [
            {
              getterFunc: 'tokenA',
              variable: tokenA.address,
              eventEmitted: 'TokenASet',
            },
            {
              getterFunc: 'tokenB',
              variable: uniswap.getWETH().address,
              eventEmitted: 'TokenBSet',
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
    when('uniswap is zero address', () => {
      then('reverts with message error', async () => {
        await behaviours.deployShouldSetVariablesAndEmitEvents({
          contract: DCAPairParametersContract,
          args: [
            tokenA.address,
            uniswap.getWETH().address,
            uniswap.getUniswapV2Router02().address,
          ],
          settersGettersVariablesAndEvents: [
            {
              getterFunc: 'name',
              variable: 'DCA: ' + tokenA.symbol,
              eventEmitted: 'TokenASet',
            },
            {
              getterFunc: 'tokenB',
              variable: uniswap.getWETH().address,
              eventEmitted: 'TokenBSet',
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
        const previousMagnitude = ethers.BigNumber.from(10).pow(
          await uniswap.getWETH().decimals()
        );
        expect(await DCAPairParameters.magnitude()).to.equal(previousMagnitude);
        await behaviours.txShouldSetVariableAndEmitEvent({
          contract: DCAPairParameters,
          getterFunc: 'tokenB',
          setterFunc: 'setTokenB',
          variable: newTo.address,
          eventEmitted: 'TokenBSet',
        });
        const postMagnitude = ethers.BigNumber.from(10).pow(
          await newTo.decimals()
        );
        expect(await DCAPairParameters.magnitude()).to.equal(postMagnitude);
      });
    });
  });

  describe('setUniswap', () => {
    context('when address is zero', () => {
      it('reverts with message', async () => {
        await behaviours.txShouldRevertWithZeroAddress({
          contract: DCAPairParameters,
          func: 'setUniswap',
          args: [constants.ZERO_ADDRESS],
        });
      });
    });
    context('when address is not zero', () => {
      it('sets uniswap and emits event with correct arguments', async () => {
        await behaviours.txShouldSetVariableAndEmitEvent({
          contract: DCAPairParameters,
          getterFunc: 'uniswap',
          setterFunc: 'setUniswap',
          variable: constants.NOT_ZERO_ADDRESS,
          eventEmitted: 'UniswapSet',
        });
      });
    });
  });
});
