import { DCAHub__factory, DCAHub } from '@typechained';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { ethers } from 'hardhat';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { constants, erc20, wallet } from '@test-utils';
import { contract, given, then, when } from '@test-utils/bdd';
import Web3 from 'web3';
import { expect } from 'chai';
import { snapshot } from '@test-utils/evm';

contract('DCAHub', () => {
  let immediateGovernor: SignerWithAddress;
  let timeLockedGovernor: SignerWithAddress;

  let DCAHubFactory: DCAHub__factory;
  let DCAHub: DCAHub;

  let snapshotId: string;

  const IMMEDIATE_ROLE: string = new Web3().utils.soliditySha3('IMMEDIATE_ROLE') as string;
  const TIME_LOCKED_ROLE: string = new Web3().utils.soliditySha3('TIME_LOCKED_ROLE') as string;
  const PLATFORM_WITHDRAW_ROLE: string = new Web3().utils.soliditySha3('PLATFORM_WITHDRAW_ROLE') as string;

  before(async () => {
    DCAHubFactory = await ethers.getContractFactory('contracts/DCAHub/DCAHub.sol:DCAHub');
    [immediateGovernor, timeLockedGovernor] = await ethers.getSigners();
    DCAHub = await DCAHubFactory.deploy(
      immediateGovernor.address,
      timeLockedGovernor.address,
      constants.NOT_ZERO_ADDRESS,
      constants.NOT_ZERO_ADDRESS
    );
    snapshotId = await snapshot.take();
  });

  beforeEach(async () => {
    await snapshot.revert(snapshotId);
  });

  describe('granting platform withdraw role', () => {
    when('not granting from role admin', () => {
      let grantRoleTx: Promise<TransactionResponse>;
      given(async () => {
        grantRoleTx = DCAHub.connect(immediateGovernor).grantRole(PLATFORM_WITHDRAW_ROLE, wallet.generateRandomAddress());
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
        await DCAHub.connect(timeLockedGovernor).grantRole(PLATFORM_WITHDRAW_ROLE, newDudeWithRole);
      });
      then('grants platform withdraw role to new address', async () => {
        expect(await DCAHub.hasRole(PLATFORM_WITHDRAW_ROLE, newDudeWithRole)).to.be.true;
      });
    });
  });

  describe('granting immediate role', () => {
    when('not granting from role admin', () => {
      let grantRoleTx: Promise<TransactionResponse>;
      given(async () => {
        grantRoleTx = DCAHub.connect(timeLockedGovernor).grantRole(IMMEDIATE_ROLE, wallet.generateRandomAddress());
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
        await DCAHub.connect(immediateGovernor).grantRole(IMMEDIATE_ROLE, newDudeWithRole);
      });
      then('grants immediate role to new address', async () => {
        expect(await DCAHub.hasRole(IMMEDIATE_ROLE, newDudeWithRole)).to.be.true;
      });
    });
  });

  describe('granting timelocked role', () => {
    when('not granting from role admin', () => {
      let grantRoleTx: Promise<TransactionResponse>;
      given(async () => {
        grantRoleTx = DCAHub.connect(immediateGovernor).grantRole(TIME_LOCKED_ROLE, wallet.generateRandomAddress());
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
        await DCAHub.connect(timeLockedGovernor).grantRole(TIME_LOCKED_ROLE, newDudeWithRole);
      });
      then('grants timelocked role to new address', async () => {
        expect(await DCAHub.hasRole(TIME_LOCKED_ROLE, newDudeWithRole)).to.be.true;
      });
    });
  });
});
