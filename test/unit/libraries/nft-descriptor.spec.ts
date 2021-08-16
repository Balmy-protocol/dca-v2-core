import { expect } from 'chai';
import { BigNumber, BigNumberish, Contract, ContractFactory } from 'ethers';
import { ethers } from 'hardhat';

describe('NFTDescriptor', () => {
  let NFTDescriptorContract: ContractFactory;
  let NFTDescriptor: Contract;

  before('Setup accounts and contracts', async () => {
    NFTDescriptorContract = await ethers.getContractFactory('contracts/mocks/NFTDescriptor.sol:NFTDescriptorMock');
  });

  beforeEach('Deploy and configure', async () => {
    NFTDescriptor = await NFTDescriptorContract.deploy();
  });

  describe('#addressToString', () => {
    it('returns the correct string for a given address', async () => {
      let addressStr = await NFTDescriptor.addressToString(`0x${'1234abcdef'.repeat(4)}`);
      expect(addressStr).to.eq('0x1234abcdef1234abcdef1234abcdef1234abcdef');
      addressStr = await NFTDescriptor.addressToString(`0x${'1'.repeat(40)}`);
      expect(addressStr).to.eq(`0x${'1'.repeat(40)}`);
    });
  });

  describe('#fixedPointToDecimalString', () => {
    describe('returns the correct string for', () => {
      it('large numbers', async () => {
        expect(await calculateString(BigNumber.from(10).pow(11).mul(1125811), 1, 18)).to.eq('112580000000000000');
        expect(await calculateString(BigNumber.from(10).pow(5).mul(176626), 1, 18)).to.eq('17663000000');
      });

      it('exactly 5 sigfig whole number', async () => {
        expect(await calculateString(42026, 1, 18)).to.eq('42026');
      });

      it('when the decimal is at index 4', async () => {
        expect(await calculateString(12087, 10, 18)).to.eq('1208.7');
      });

      it('when the decimal is at index 3', async () => {
        expect(await calculateString(12087, 100, 18)).to.eq('120.87');
      });

      it('when the decimal is at index 2', async () => {
        expect(await calculateString(12087, 1000, 18)).to.eq('12.087');
      });

      it('when the decimal is at index 1', async () => {
        expect(await calculateString(12345, 10000, 18)).to.eq('1.2345');
      });

      it('when sigfigs have trailing 0s after the decimal', async () => {
        expect(await calculateString(1, 1, 18)).to.eq('1.0000');
      });

      it('when there are exactly 5 numbers after the decimal', async () => {
        expect(await calculateString(12345, 100000, 18)).to.eq('0.12345');
      });

      it('very small numbers', async () => {
        expect(await calculateString(38741, BigNumber.from(10).pow(14), 18)).to.eq('0.00000000038741');
        expect(await calculateString(88498, BigNumber.from(10).pow(16), 18)).to.eq('0.0000000000088498');
      });

      it('smallest number', async () => {
        expect(await calculateString(39, BigNumber.from(10).pow(18), 18)).to.eq('0.000000000000000004');
      });

      it('rounded to 0', async () => {
        expect(await calculateString(39, BigNumber.from(10).pow(19), 18)).to.eq('0.000000000000000000');
      });

      it('actual 0', async () => {
        expect(await calculateString(0, 1, 18)).to.eq('0.0000');
      });
    });

    describe('works with non 18 decimals', () => {
      it('exactly 5 sigfig whole number', async () => {
        expect(await calculateString(42026, 1, 12)).to.eq('42026');
      });

      it('when the decimal is at index 4', async () => {
        expect(await calculateString(12087, 10, 16)).to.eq('1208.7');
      });

      it('when the decimal is at index 3', async () => {
        expect(await calculateString(12087, 100, 20)).to.eq('120.87');
      });

      it('when the decimal is at index 2', async () => {
        expect(await calculateString(12087, 1000, 8)).to.eq('12.087');
      });
    });

    function calculateString(value: BigNumberish, base: BigNumberish, decimals: number) {
      const magnitude = BigNumber.from(10).pow(decimals);
      return NFTDescriptor.fixedPointToDecimalString(magnitude.mul(value).div(BigNumber.from(base)), decimals);
    }
  });
});
