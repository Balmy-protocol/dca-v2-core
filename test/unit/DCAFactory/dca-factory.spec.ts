import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { Contract, ContractFactory } from 'ethers';
import { ethers } from 'hardhat';
import { constants, behaviours } from '../../utils';

describe('DCAFactory', function () {
  let governor: SignerWithAddress;
  let feeRecipient: SignerWithAddress;
  let DCAFactoryContract: ContractFactory;
  let DCAFactory: Contract;

  before('Setup accounts and contracts', async () => {
    [governor, feeRecipient] = await ethers.getSigners();
    DCAFactoryContract = await ethers.getContractFactory('contracts/DCAFactory/DCAFactory.sol:DCAFactory');
  });

  beforeEach('Deploy and configure', async () => {
    DCAFactory = await DCAFactoryContract.deploy(governor.address, feeRecipient.address);
  });

  describe('setFeeRecipient', () => {
    behaviours.shouldBeExecutableOnlyByGovernor({
      contract: () => DCAFactory,
      funcAndSignature: 'setFeeRecipient(address)',
      params: [constants.NOT_ZERO_ADDRESS],
      governor: () => governor,
    });
  });

  describe('setFee', () => {
    behaviours.shouldBeExecutableOnlyByGovernor({
      contract: () => DCAFactory,
      funcAndSignature: 'setFee(uint256)',
      params: [1],
      governor: () => governor,
    });
  });

  describe('addSwapIntervalsToAllowedList', () => {
    behaviours.shouldBeExecutableOnlyByGovernor({
      contract: () => DCAFactory,
      funcAndSignature: 'addSwapIntervalsToAllowedList(uint256[])',
      params: [[1]],
      governor: () => governor,
    });
  });

  describe('removeSwapIntervalsFromAllowedList', () => {
    behaviours.shouldBeExecutableOnlyByGovernor({
      contract: () => DCAFactory,
      funcAndSignature: 'removeSwapIntervalsFromAllowedList(uint256[])',
      params: [[1]],
      governor: () => governor,
    });
  });
});
