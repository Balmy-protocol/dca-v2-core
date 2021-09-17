import { expect } from 'chai';
import { ethers } from 'hardhat';
import { DCAPermissionsManagerMock__factory, DCAPermissionsManagerMock } from '@typechained';
import { constants, wallet, behaviours } from '@test-utils';
import { given, then, when, contract } from '@test-utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { snapshot } from '@test-utils/evm';
import { Permission } from 'js-lib/types';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { readArgFromEventOrFail } from '@test-utils/event-utils';
import { Wallet } from '@ethersproject/wallet';

contract('DCAPermissionsManager', () => {
  let hub: SignerWithAddress;
  let DCAPermissionsManagerFactory: DCAPermissionsManagerMock__factory;
  let DCAPermissionsManager: DCAPermissionsManagerMock;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    [hub] = await ethers.getSigners();
    DCAPermissionsManagerFactory = await ethers.getContractFactory(
      'contracts/mocks/DCAPermissionsManager/DCAPermissionsManager.sol:DCAPermissionsManagerMock'
    );
    DCAPermissionsManager = await DCAPermissionsManagerFactory.deploy();
    await DCAPermissionsManager.setHub(hub.address);
    snapshotId = await snapshot.take();
  });

  beforeEach('Deploy and configure', async () => {
    await snapshot.revert(snapshotId);
  });

  describe('constructor', () => {
    let DCAPermissionsManager: DCAPermissionsManagerMock;
    given(async () => {
      DCAPermissionsManager = await DCAPermissionsManagerFactory.deploy();
    });
    when('manager is deployed', () => {
      then('hub is zero address', async () => {
        const hub = await DCAPermissionsManager.hub();
        expect(hub).to.equal(constants.ZERO_ADDRESS);
      });
      then('name is correct', async () => {
        const name = await DCAPermissionsManager.name();
        expect(name).to.equal('Mean Finance DCA');
      });
      then('symbol is correct', async () => {
        const symbol = await DCAPermissionsManager.symbol();
        expect(symbol).to.equal('DCA');
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
      let DCAPermissionsManager: DCAPermissionsManagerMock;
      given(async () => {
        DCAPermissionsManager = await DCAPermissionsManagerFactory.deploy();
        await DCAPermissionsManager.setHub(ADDRESS);
      });
      then('hub is set correctly', async () => {
        const hub = await DCAPermissionsManager.hub();
        expect(hub).to.equal(ADDRESS);
      });
    });

    when('hub is already set', () => {
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

  describe('mint', () => {
    const TOKEN_ID = 1;
    when('owner is zero address', () => {
      then('reverts with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAPermissionsManager,
          func: 'mint',
          args: [1, constants.ZERO_ADDRESS, []],
          message: 'ERC721: mint to the zero address',
        });
      });
    });
    when('id is already in use', () => {
      given(async () => {
        await DCAPermissionsManager.mint(TOKEN_ID, constants.NOT_ZERO_ADDRESS, []);
      });
      then('reverts with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAPermissionsManager,
          func: 'mint',
          args: [TOKEN_ID, constants.NOT_ZERO_ADDRESS, []],
          message: 'ERC721: token already minted',
        });
      });
    });
    when('caller is not the hub', () => {
      then('reverts with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAPermissionsManager.connect(await wallet.generateRandom()),
          func: 'mint',
          args: [TOKEN_ID, constants.NOT_ZERO_ADDRESS, []],
          message: 'OnlyHubCanExecute',
        });
      });
    });
    when('mint is executed', () => {
      const OWNER = wallet.generateRandomAddress();
      const OPERATOR = constants.NOT_ZERO_ADDRESS;
      let tx: TransactionResponse;

      given(async () => {
        tx = await DCAPermissionsManager.mint(TOKEN_ID, OWNER, [{ operator: OPERATOR, permissions: [Permission.WITHDRAW] }]);
      });

      then('permissions are assigned properly', async () => {
        expect(await DCAPermissionsManager.hasPermission(TOKEN_ID, OPERATOR, Permission.WITHDRAW)).to.be.true;
      });

      then('no extra permissions are assigned', async () => {
        for (const permission of [Permission.INCREASE, Permission.REDUCE, Permission.TERMINATE]) {
          expect(await DCAPermissionsManager.hasPermission(TOKEN_ID, OPERATOR, permission)).to.be.false;
        }
      });

      then('there operators are assigned', async () => {
        const operators = await DCAPermissionsManager.operators(TOKEN_ID);
        expect(operators).to.eql([OPERATOR]);
      });

      then('nft is created and assigned to owner', async () => {
        const tokenOwner = await DCAPermissionsManager.ownerOf(TOKEN_ID);
        const balance = await DCAPermissionsManager.balanceOf(OWNER);
        expect(tokenOwner).to.equal(OWNER);
        expect(balance).to.equal(TOKEN_ID);
      });

      then('event is emitted', async () => {
        const id = await readArgFromEventOrFail(tx, 'Minted', 'id');
        const owner = await readArgFromEventOrFail(tx, 'Minted', 'owner');
        const permissions: any = await readArgFromEventOrFail(tx, 'Minted', 'permissions');
        expect(id).to.equal(TOKEN_ID);
        expect(owner).to.equal(OWNER);
        expect(permissions.length).to.equal(1);
        expect(permissions[0].operator).to.equal(OPERATOR);
        expect(permissions[0].permissions).to.eql([Permission.WITHDRAW]);
      });
    });
  });
  describe('transfer', () => {
    const TOKEN_ID = 1;
    const OPERATOR = constants.NOT_ZERO_ADDRESS;
    const NEW_OWNER = wallet.generateRandomAddress();
    let owner: Wallet;

    given(async () => {
      owner = await wallet.generateRandom();
      await DCAPermissionsManager.mint(TOKEN_ID, owner.address, [{ operator: OPERATOR, permissions: [Permission.WITHDRAW] }]);
      await DCAPermissionsManager.connect(owner).transferFrom(owner.address, NEW_OWNER, TOKEN_ID);
    });

    when('a token is transfered', () => {
      then('reported owner has changed', async () => {
        const newOwner = await DCAPermissionsManager.ownerOf(TOKEN_ID);
        expect(newOwner).to.equal(NEW_OWNER);
      });

      then('previous operators lost permissions', async () => {
        const hasPermission = await DCAPermissionsManager.hasPermission(TOKEN_ID, OPERATOR, Permission.WITHDRAW);
        expect(hasPermission).to.be.false;
      });

      then('operators list is now empty', async () => {
        const operators = await DCAPermissionsManager.operators(TOKEN_ID);
        expect(operators).to.be.empty;
      });
    });
  });
  describe('burn', () => {
    const TOKEN_ID = 1;
    const OPERATOR = constants.NOT_ZERO_ADDRESS;
    const OWNER = wallet.generateRandomAddress();

    given(async () => {
      await DCAPermissionsManager.mint(TOKEN_ID, OWNER, [{ operator: OPERATOR, permissions: [Permission.WITHDRAW] }]);
    });

    when('caller is not the hub', () => {
      then('reverts with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAPermissionsManager.connect(await wallet.generateRandom()),
          func: 'burn',
          args: [TOKEN_ID],
          message: 'OnlyHubCanExecute',
        });
      });
    });

    when('the hub is the caller', () => {
      given(async () => {
        await DCAPermissionsManager.burn(TOKEN_ID);
      });

      then('nft is burned', async () => {
        const balance = await DCAPermissionsManager.balanceOf(OWNER);
        expect(balance).to.equal(0);
      });

      then('asking for permission reverts', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAPermissionsManager,
          func: 'hasPermission',
          args: [TOKEN_ID, OPERATOR, Permission.WITHDRAW],
          message: 'ERC721: owner query for nonexistent token',
        });
      });

      then('operators list is now empty', async () => {
        const operators = await DCAPermissionsManager.operators(TOKEN_ID);
        expect(operators).to.be.empty;
      });
    });
  });
  describe('modify', () => {
    const TOKEN_ID = 1;
    const [OPERATOR_1, OPERATOR_2] = ['0x0000000000000000000000000000000000000001', '0x0000000000000000000000000000000000000002'];

    when('caller is not the owner', () => {
      given(async () => {
        const owner = await wallet.generateRandom();
        await DCAPermissionsManager.mint(TOKEN_ID, owner.address, []);
      });
      then('reverts with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAPermissionsManager.connect(await wallet.generateRandom()),
          func: 'modify',
          args: [TOKEN_ID, []],
          message: 'NotOwner',
        });
      });
    });

    modifyTest({
      when: 'permissions are added for a new operators',
      initial: [],
      modify: [{ operator: OPERATOR_1, permissions: [Permission.TERMINATE] }],
      expected: [{ operator: OPERATOR_1, permissions: [Permission.TERMINATE] }],
    });

    modifyTest({
      when: 'permissions are modified for existing operators',
      initial: [{ operator: OPERATOR_1, permissions: [Permission.WITHDRAW] }],
      modify: [
        { operator: OPERATOR_1, permissions: [Permission.INCREASE] },
        { operator: OPERATOR_2, permissions: [Permission.REDUCE] },
      ],
      expected: [
        { operator: OPERATOR_1, permissions: [Permission.INCREASE] },
        { operator: OPERATOR_2, permissions: [Permission.REDUCE] },
      ],
    });

    modifyTest({
      when: 'permissions are removed for existing operators',
      initial: [{ operator: OPERATOR_1, permissions: [Permission.WITHDRAW] }],
      modify: [{ operator: OPERATOR_1, permissions: [] }],
      expected: [{ operator: OPERATOR_1, permissions: [] }],
    });

    type Permissions = { operator: string; permissions: Permission[] }[];
    function modifyTest({
      when: title,
      initial,
      modify,
      expected,
    }: {
      when: string;
      initial: Permissions;
      modify: Permissions;
      expected: Permissions;
    }) {
      when(title, () => {
        let tx: TransactionResponse;
        given(async () => {
          const owner = await wallet.generateRandom();
          await DCAPermissionsManager.mint(TOKEN_ID, owner.address, initial);
          tx = await DCAPermissionsManager.connect(owner).modify(TOKEN_ID, modify);
        });
        then('then permissions are updated correctly', async () => {
          const operators = await DCAPermissionsManager.operators(TOKEN_ID);
          for (const { operator, permissions } of expected) {
            for (const permission of [Permission.INCREASE, Permission.REDUCE, Permission.TERMINATE, Permission.WITHDRAW]) {
              expect(await DCAPermissionsManager.hasPermission(TOKEN_ID, operator, permission)).to.equal(permissions.includes(permission));
            }
            expect(operators.includes(operator)).to.equal(permissions.length > 0);
          }
        });
        then('event is emitted', async () => {
          const id = await readArgFromEventOrFail(tx, 'Modified', 'id');
          const permissions: any = await readArgFromEventOrFail(tx, 'Modified', 'permissions');
          expect(id).to.equal(TOKEN_ID);
          expect(permissions.length).to.equal(modify.length);
          for (let i = 0; i < modify.length; i++) {
            expect(permissions[i].operator).to.equal(modify[i].operator);
            expect(permissions[i].permissions).to.eql(modify[i].permissions);
          }
        });
      });
    }
  });
});
