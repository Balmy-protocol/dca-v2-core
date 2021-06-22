import { Contract, ContractFactory, Wallet } from 'ethers';
import { ethers } from 'hardhat';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { constants, behaviours, wallet, contracts } from '../../utils';
import { given, then, when } from '../../utils/bdd';
import { expect } from 'chai';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';

describe('Governable', function () {
  let governor: SignerWithAddress;
  let governableContract: ContractFactory;
  let governable: Contract;

  before('Setup accounts and contracts', async () => {
    [governor] = await ethers.getSigners();
    governableContract = await ethers.getContractFactory('contracts/mocks/utils/Governable.sol:GovernableMock');
  });

  beforeEach('Deploy and configure', async () => {
    governable = await governableContract.deploy(governor.address);
  });

  describe('constructor', () => {
    when('initializing with governor as zero address', () => {
      then('deployment is reverted with reason', async () => {
        await behaviours.deployShouldRevertWithZeroAddress({
          contract: governableContract,
          args: [constants.ZERO_ADDRESS],
        });
      });
    });
    when('initialized with a governor thats not zero address', () => {
      let deploymentTx: TransactionResponse;
      let deployedContract: Contract;
      given(async () => {
        const deployment = await contracts.deploy(governableContract, [governor.address]);
        deploymentTx = deployment.tx;
        deployedContract = deployment.contract;
      });
      then('deployment is succesful', async () => {
        await expect(deploymentTx.wait()).to.not.be.reverted;
      });
      then('governor is set correctly', async () => {
        expect(await deployedContract.governor()).to.equal(governor.address);
      });
    });
  });

  describe('_setPendingGovernor', () => {
    when('pending governor is zero address', () => {
      let setPendingGovernorTx: Promise<TransactionResponse>;
      given(async () => {
        setPendingGovernorTx = governable.setPendingGovernorInternal(constants.ZERO_ADDRESS);
      });
      then('tx is reverted with reason', async () => {
        await expect(setPendingGovernorTx).to.be.revertedWith('Governable: zero address');
      });
    });
    when('pending governor is not zero address', () => {
      let setPendingGovernorTx: TransactionResponse;
      let pendingGovernor: string;
      given(async () => {
        pendingGovernor = await wallet.generateRandomAddress();
        setPendingGovernorTx = await governable.setPendingGovernorInternal(pendingGovernor);
      });
      then('sets pending governor', async () => {
        expect(await governable.pendingGovernor()).to.be.equal(pendingGovernor);
      });
      then('emits event with correct argument', async () => {
        await expect(setPendingGovernorTx).to.emit(governable, 'PendingGovernorSet').withArgs(pendingGovernor);
      });
    });
  });

  describe('setPendingGovernor', () => {
    behaviours.shouldBeExecutableOnlyByGovernor({
      contract: () => governable,
      funcAndSignature: 'setPendingGovernor(address)',
      params: [constants.NOT_ZERO_ADDRESS],
      governor: () => governor,
    });
  });

  describe('_acceptPendingGovernor', () => {
    when('there is no pending governor', () => {
      let acceptPendingGovernorTx: Promise<TransactionResponse>;
      given(async () => {
        acceptPendingGovernorTx = governable.acceptPendingGovernorInternal();
      });
      then('tx is reverted with reason', async () => {
        await expect(acceptPendingGovernorTx).to.be.revertedWith('Governable: no pending governor');
      });
    });
    when('there is a pending governor', () => {
      let acceptPendingGovernorTx: TransactionResponse;
      let pendingGovernor: string;
      given(async () => {
        pendingGovernor = await wallet.generateRandomAddress();
        await governable.setPendingGovernor(pendingGovernor);
        acceptPendingGovernorTx = await governable.acceptPendingGovernorInternal();
      });
      then('pending governor becomes governor', async () => {
        expect(await governable.governor()).to.equal(pendingGovernor);
      });
      then('pending governor is set to zero', async () => {
        expect(await governable.pendingGovernor()).to.equal(constants.ZERO_ADDRESS);
      });
      then('emits event', async () => {
        await expect(acceptPendingGovernorTx).to.emit(governable, 'PendingGovernorAccepted');
      });
    });
  });

  describe('acceptPendingGovernor', () => {
    behaviours.shouldBeExecutableOnlyByPendingGovernor({
      contract: () => governable,
      funcAndSignature: 'acceptPendingGovernor()',
      governor: () => governor,
    });
  });

  describe('isGovernor', () => {
    when('not querying for governor address', () => {
      then('returns false', async () => {
        expect(await governable.isGovernor(await wallet.generateRandomAddress())).to.be.false;
      });
    });
    when('querying for governor address', () => {
      then('returns true', async () => {
        expect(await governable.isGovernor(governor.address)).to.be.true;
      });
    });
  });
  describe('isPendingGovernor', () => {
    when('not querying for pending governor address', () => {
      then('returns false', async () => {
        expect(await governable.isPendingGovernor(await wallet.generateRandomAddress())).to.be.false;
      });
    });
    when('querying for pending governor address', () => {
      let pendingGovernor: string;
      given(async () => {
        pendingGovernor = await wallet.generateRandomAddress();
        await governable.setPendingGovernor(pendingGovernor);
      });
      then('returns true', async () => {
        expect(await governable.isPendingGovernor(pendingGovernor)).to.be.true;
      });
    });
  });

  describe('onlyGovernor', () => {
    behaviours.shouldBeExecutableOnlyByGovernor({
      contract: () => governable,
      funcAndSignature: 'onlyGovernorAllowed()',
      governor: () => governor,
    });
  });
  describe('onlyPendingGovernor', () => {
    behaviours.shouldBeExecutableOnlyByPendingGovernor({
      contract: () => governable,
      funcAndSignature: 'onlyPendingGovernorAllowed()',
      governor: () => governor,
    });
  });
});
