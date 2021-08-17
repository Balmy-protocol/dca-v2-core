import { DCAGlobalParameters, DCAGlobalParameters__factory } from '@typechained';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { ethers } from 'hardhat';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { wallet } from '@test-utils';
import { contract, given, then, when } from '@test-utils/bdd';
import Web3 from 'web3';
import { expect } from 'chai';

contract('DCAGlobalParameters', () => {
  let immediateGovernor: SignerWithAddress;
  let timeLockedGovernor: SignerWithAddress;
  let feeRecipient: SignerWithAddress;

  let globalParametersFactory: DCAGlobalParameters__factory;
  let globalParameters: DCAGlobalParameters;

  const IMMEDIATE_ROLE: string = new Web3().utils.soliditySha3('IMMEDIATE_ROLE') as string;
  const TIME_LOCKED_ROLE: string = new Web3().utils.soliditySha3('TIME_LOCKED_ROLE') as string;

  before(async () => {
    globalParametersFactory = await ethers.getContractFactory('contracts/DCAGlobalParameters/DCAGlobalParameters.sol:DCAGlobalParameters');
  });

  beforeEach(async () => {
    [immediateGovernor, timeLockedGovernor, feeRecipient] = await ethers.getSigners();
    globalParameters = await globalParametersFactory.deploy(
      immediateGovernor.address,
      timeLockedGovernor.address,
      feeRecipient.address,
      wallet.generateRandomAddress(),
      wallet.generateRandomAddress()
    );
  });

  describe('granting immediate role', () => {
    when('not granting from role admin', () => {
      let grantRoleTx: Promise<TransactionResponse>;
      given(async () => {
        grantRoleTx = globalParameters.connect(timeLockedGovernor).grantRole(IMMEDIATE_ROLE, wallet.generateRandomAddress(), { gasPrice: 0 });
      });
      then('tx is reverted', async () => {
        await expect(grantRoleTx).to.be.revertedWith(
          `AccessControl: account ${timeLockedGovernor.address.toLowerCase()} is missing role ${IMMEDIATE_ROLE.toLowerCase()}`
        );
      });
    });
    when('granting from admin of role', () => {
      const newDudeWithRole = wallet.generateRandomAddress();
      given(async () => {
        await globalParameters.connect(immediateGovernor).grantRole(IMMEDIATE_ROLE, newDudeWithRole);
      });
      then('grants immediate role to new address', async () => {
        expect(await globalParameters.hasRole(IMMEDIATE_ROLE, newDudeWithRole)).to.be.true;
      });
    });
  });

  describe('granting timelocked role', () => {
    when('not granting from role admin', () => {
      let grantRoleTx: Promise<TransactionResponse>;
      given(async () => {
        grantRoleTx = globalParameters.connect(immediateGovernor).grantRole(TIME_LOCKED_ROLE, wallet.generateRandomAddress(), { gasPrice: 0 });
      });
      then('tx is reverted', async () => {
        await expect(grantRoleTx).to.be.revertedWith(
          `AccessControl: account ${immediateGovernor.address.toLowerCase()} is missing role ${TIME_LOCKED_ROLE.toLowerCase()}`
        );
      });
    });
    when('granting from admin of role', () => {
      const newDudeWithRole = wallet.generateRandomAddress();
      given(async () => {
        await globalParameters.connect(timeLockedGovernor).grantRole(TIME_LOCKED_ROLE, newDudeWithRole);
      });
      then('grants timelocked role to new address', async () => {
        expect(await globalParameters.hasRole(TIME_LOCKED_ROLE, newDudeWithRole)).to.be.true;
      });
    });
  });
});
