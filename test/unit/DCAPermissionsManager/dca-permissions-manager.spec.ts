import { expect } from 'chai';
import { ethers } from 'hardhat';
import { DCAPermissionsManager__factory, DCAPermissionsManager } from '@typechained';
import { constants, wallet, behaviours } from '@test-utils';
import { given, then, when, contract } from '@test-utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { snapshot } from '@test-utils/evm';

contract('DCAPermissionsManager', () => {
  let owner: SignerWithAddress;
  let DCAPermissionsManagerFactory: DCAPermissionsManager__factory;
  let DCAPermissionsManager: DCAPermissionsManager;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    [owner] = await ethers.getSigners();
    DCAPermissionsManagerFactory = await ethers.getContractFactory(
      'contracts/DCAPermissionsManager/DCAPermissionsManager.sol:DCAPermissionsManager'
    );
    DCAPermissionsManager = await DCAPermissionsManagerFactory.deploy();
    snapshotId = await snapshot.take();
  });

  beforeEach('Deploy and configure', async () => {
    await snapshot.revert(snapshotId);
  });

  describe('constructor', () => {
    when('manager is deployed', () => {
      then('hub is zero address', async () => {
        const hub = await DCAPermissionsManager.hub();
        expect(hub).to.equal(constants.ZERO_ADDRESS);
      });
    });
  });

  describe('setHub', () => {
    when('parameter is zero address', () => {
      then('reverts with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAPermissionsManager,
          func: 'setHub',
          args: [constants.ZERO_ADDRESS],
          message: 'ZeroAddress',
        });
      });
    });

    when('parameter is a valid address', () => {
      const ADDRESS = wallet.generateRandomAddress();
      given(async () => {
        await DCAPermissionsManager.setHub(ADDRESS);
      });
      then('hub is set correctly', async () => {
        const hub = await DCAPermissionsManager.hub();
        expect(hub).to.equal(ADDRESS);
      });
    });

    when('hub is already set', () => {
      given(async () => {
        await DCAPermissionsManager.setHub(wallet.generateRandomAddress());
      });
      then('reverts with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAPermissionsManager,
          func: 'setHub',
          args: [constants.NOT_ZERO_ADDRESS],
          message: 'HubAlreadySet',
        });
      });
    });
  });
});
