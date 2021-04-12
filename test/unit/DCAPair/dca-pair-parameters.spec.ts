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

  function addNewRatePerUnitTest({
    title,
    token,
    previousAccumRatesPerUnit,
    previousAccumRatesPerUnitMultiplier,
    performedSwap,
    ratePerUnit,
  }: {
    title: string;
    token: () => string;
    previousAccumRatesPerUnit: BigNumber | number | string;
    previousAccumRatesPerUnitMultiplier: BigNumber | number | string;
    performedSwap: BigNumber | number | string;
    ratePerUnit: BigNumber | number | string;
  }) {
    const previousAccumRatesPerUnitBN = bn.toBN(previousAccumRatesPerUnit);
    const previousAccumRatesPerUnitMultiplierBN = bn.toBN(
      previousAccumRatesPerUnitMultiplier
    );
    const performedSwapBN = bn.toBN(performedSwap);
    const ratePerUnitBN = bn.toBN(ratePerUnit);

    when(title, () => {
      given(async () => {
        await DCAPairParameters.setAcummRatesPerUnit(
          token(),
          performedSwapBN.sub(1),
          [previousAccumRatesPerUnitBN, previousAccumRatesPerUnitMultiplierBN]
        );
        await DCAPairParameters.addNewRatePerUnit(
          token(),
          performedSwapBN,
          ratePerUnit
        );
      });
      then(
        'increments the rates per unit accumulator base and overflow if needed',
        async () => {
          if (
            previousAccumRatesPerUnitBN
              .add(ratePerUnitBN)
              .gt(ethers.constants.MaxUint256)
          ) {
            expect(
              await DCAPairParameters.accumRatesPerUnit(
                token(),
                performedSwapBN,
                0
              )
            ).to.equal(
              ratePerUnitBN.sub(
                ethers.constants.MaxUint256.sub(previousAccumRatesPerUnitBN)
              )
            );
            expect(
              await DCAPairParameters.accumRatesPerUnit(
                token(),
                performedSwapBN,
                1
              )
            ).to.equal(previousAccumRatesPerUnitMultiplierBN.add(1));
          } else {
            expect(
              await DCAPairParameters.accumRatesPerUnit(
                token(),
                performedSwapBN,
                0
              )
            ).to.equal(previousAccumRatesPerUnitBN.add(ratePerUnitBN));
            expect(
              await DCAPairParameters.accumRatesPerUnit(
                token(),
                performedSwapBN,
                1
              )
            ).to.equal(previousAccumRatesPerUnitMultiplierBN);
          }
        }
      );
    });
  }

  describe('_addNewRatePerUnit', () => {
    addNewRatePerUnitTest({
      title: 'is the first swap of token A',
      token: () => tokenA.address,
      previousAccumRatesPerUnit: 0,
      previousAccumRatesPerUnitMultiplier: 0,
      performedSwap: 1,
      ratePerUnit: 123456789,
    });

    addNewRatePerUnitTest({
      title:
        'the addition does not overflow the accumulated rates per unit of token A',
      token: () => tokenA.address,
      previousAccumRatesPerUnit: 123456789,
      previousAccumRatesPerUnitMultiplier: 0,
      performedSwap: 2,
      ratePerUnit: 9991230,
    });

    addNewRatePerUnitTest({
      title:
        'previous rate per unit accumulator was too big and overflows token A',
      token: () => tokenA.address,
      previousAccumRatesPerUnit: ethers.constants.MaxUint256.sub('10000'),
      previousAccumRatesPerUnitMultiplier: 0,
      performedSwap: 3,
      ratePerUnit: 9991230,
    });

    addNewRatePerUnitTest({
      title:
        'new rate per unit is too big and overflows accumulator of token A',
      token: () => tokenA.address,
      previousAccumRatesPerUnit: 123456789,
      previousAccumRatesPerUnitMultiplier: 0,
      performedSwap: 3,
      ratePerUnit: ethers.constants.MaxUint256.sub('123456'),
    });

    addNewRatePerUnitTest({
      title: 'is the first swap of token B',
      token: () => tokenB.address,
      previousAccumRatesPerUnit: 0,
      previousAccumRatesPerUnitMultiplier: 0,
      performedSwap: 1,
      ratePerUnit: 123456789,
    });
    addNewRatePerUnitTest({
      title:
        'the addition does not overflow the accumulated rates per unit of token B',
      token: () => tokenB.address,
      previousAccumRatesPerUnit: 123456789,
      previousAccumRatesPerUnitMultiplier: 0,
      performedSwap: 2,
      ratePerUnit: 9991230,
    });
    addNewRatePerUnitTest({
      title:
        'previous rate per unit accumulator was too big and overflows token B',
      token: () => tokenB.address,
      previousAccumRatesPerUnit: ethers.constants.MaxUint256.sub('10000'),
      previousAccumRatesPerUnitMultiplier: 0,
      performedSwap: 3,
      ratePerUnit: 9991230,
    });

    addNewRatePerUnitTest({
      title:
        'new rate per unit is too big and overflows accumulator of token B',
      token: () => tokenB.address,
      previousAccumRatesPerUnit: 123456789,
      previousAccumRatesPerUnitMultiplier: 0,
      performedSwap: 3,
      ratePerUnit: ethers.constants.MaxUint256.sub('123456'),
    });
  });
});
