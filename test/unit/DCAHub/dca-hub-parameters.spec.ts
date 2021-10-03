import { BigNumber, BigNumberish, utils } from 'ethers';
import { ethers } from 'hardhat';
import { DCAHubParametersMock__factory, DCAHubParametersMock } from '@typechained';
import { constants, bn } from '@test-utils';
import { contract, then, when } from '@test-utils/bdd';
import { snapshot } from '@test-utils/evm';
import { expect } from 'chai';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';

contract('DCAHubParameters', () => {
  let owner: SignerWithAddress;
  let DCAHubParametersContract: DCAHubParametersMock__factory;
  let DCAHubParameters: DCAHubParametersMock;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    [owner] = await ethers.getSigners();
    DCAHubParametersContract = await ethers.getContractFactory('contracts/mocks/DCAHub/DCAHubParameters.sol:DCAHubParametersMock');
    DCAHubParameters = await DCAHubParametersContract.deploy();
    snapshotId = await snapshot.take();
  });

  beforeEach('Deploy and configure', async () => {
    await snapshot.revert(snapshotId);
  });

  const getFeeFromAmountTest = async ({ title, amount, fee }: { title: string; amount: BigNumber | number | string; fee: BigNumberish }) => {
    when(title, () => {
      then('fee from amount is correct', async () => {
        expect(await DCAHubParameters.getFeeFromAmount(fee, amount)).to.equal(await getFeeFrom(fee, amount));
      });
    });
  };

  describe('_getFeeFromAmount', () => {
    getFeeFromAmountTest({
      title: 'multiplying amount for protocol fee does not overflow',
      amount: utils.parseEther('9482.12343'),
      fee: 3000,
    });
  });

  async function getFeeFrom(fee: BigNumberish, value: BigNumber | string | number): Promise<BigNumber> {
    value = bn.toBN(value);
    const feePrecision = BigNumber.from(await DCAHubParameters.FEE_PRECISION());
    if (value.mul(fee).lt(constants.MAX_UINT_256)) {
      return value.mul(fee).div(feePrecision).div(100);
    } else {
      return feePrecision.lt(fee) ? value.div(feePrecision).div(100).mul(fee) : value.div(feePrecision).mul(fee).div(100);
    }
  }
});
