import { BigNumber, Contract, ContractFactory, Signer, utils } from 'ethers';
import { ethers } from 'hardhat';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { constants, erc20, behaviours, bn, wallet, contracts } from '../../utils';
import { given, then, when } from '../../utils/bdd';
import { expect } from 'chai';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

describe('DCAPairParameters', function () {
  let owner: SignerWithAddress;
  let tokenA: Contract, tokenB: Contract;
  let factory: string;
  let DCAPairParametersContract: ContractFactory;
  let DCAPairParameters: Contract;
  let DCAFactoryContract: ContractFactory;
  let DCAFactory: Contract;

  before('Setup accounts and contracts', async () => {
    [owner] = await ethers.getSigners();
    DCAFactoryContract = await ethers.getContractFactory('contracts/mocks/DCAFactory/DCAFactory.sol:DCAFactoryMock');
    DCAPairParametersContract = await ethers.getContractFactory('contracts/mocks/DCAPair/DCAPairParameters.sol:DCAPairParametersMock');
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
    factory = await wallet.generateRandomAddress();
    DCAFactory = await DCAFactoryContract.deploy(owner.address, await wallet.generateRandomAddress());
    DCAPairParameters = await DCAPairParametersContract.deploy(DCAFactory.address, tokenA.address, tokenB.address);
  });

  describe('constructor', () => {
    when('factory is zero address', () => {
      then('deployment is reverted with reason', async () => {
        await behaviours.deployShouldRevertWithZeroAddress({
          contract: DCAPairParametersContract,
          args: [constants.ZERO_ADDRESS, tokenA.address, tokenB.address],
        });
      });
    });
    when('token A is zero address', () => {
      then('deployment is reverted with reason', async () => {
        await behaviours.deployShouldRevertWithZeroAddress({
          contract: DCAPairParametersContract,
          args: [factory, constants.ZERO_ADDRESS, tokenB.address],
        });
      });
    });
    when('token B is zero address', () => {
      then('deployment is reverted with reason', async () => {
        await behaviours.deployShouldRevertWithZeroAddress({
          contract: DCAPairParametersContract,
          args: [factory, tokenA.address, constants.ZERO_ADDRESS],
        });
      });
    });
    when('all arguments are valid', () => {
      let deploymentTx: TransactionResponse;
      let deployedContract: Contract;
      given(async () => {
        const deployment = await contracts.deploy(DCAPairParametersContract, [factory, tokenA.address, tokenB.address]);
        deploymentTx = deployment.tx;
        deployedContract = deployment.contract;
      });
      then('sets factory', async () => {
        expect(await deployedContract.factory()).to.equal(factory);
      });
      then('sets token A', async () => {
        expect(await deployedContract.tokenA()).to.equal(tokenA.address);
      });
      then('sets magnitude A', async () => {
        expect(await deployedContract.magnitudeA()).to.equal(BigNumber.from('10').pow(await tokenA.decimals()));
      });
      then('sets token B', async () => {
        expect(await deployedContract.tokenB()).to.equal(tokenB.address);
      });
      then('sets magnitude B', async () => {
        expect(await deployedContract.magnitudeB()).to.equal(BigNumber.from('10').pow(await tokenB.decimals()));
      });
    });
  });

  const getFeeFromAmountTest = async ({
    title,
    amount,
    fee,
  }: {
    title: string;
    amount: BigNumber | number | string;
    fee?: BigNumber | number | string;
  }) => {
    when(title, () => {
      given(async () => {
        if (!!fee) await DCAFactory.setFee(fee);
      });
      then('fee from amount is correct', async () => {
        expect(await DCAPairParameters.getFeeFromAmount(amount)).to.equal(await getFeeFrom(amount));
      });
    });
  };

  describe('_getFeeFromAmount', () => {
    getFeeFromAmountTest({
      title: 'multiplying amount for protocol fee does not overflow',
      amount: utils.parseEther('9482.12343'),
    });
    when('multiplying overflows', async () => {
      getFeeFromAmountTest({
        title: 'FEE_PRECISION is less than protocol fee',
        amount: constants.MAX_UINT_256,
        fee: 10000 + 1,
      });
      getFeeFromAmountTest({
        title: 'protocol fee is less than FEE_PRECISION',
        amount: constants.MAX_UINT_256,
        fee: 10000 - 1,
      });
    });
  });

  async function getFeeFrom(value: BigNumber | string | number): Promise<BigNumber> {
    value = bn.toBN(value) as BigNumber;
    const feePrecision = BigNumber.from(await DCAFactory.FEE_PRECISION());
    const fee = BigNumber.from(await DCAFactory.fee());
    if (value.mul(fee).lt(constants.MAX_UINT_256)) {
      return value.mul(fee).div(feePrecision).div(100);
    } else {
      return feePrecision.lt(fee) ? value.div(feePrecision).div(100).mul(fee) : value.div(feePrecision).mul(fee).div(100);
    }
  }
});
