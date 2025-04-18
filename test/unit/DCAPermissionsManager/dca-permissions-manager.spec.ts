import { expect } from 'chai';
import { ethers } from 'hardhat';
import { DCAPermissionsManagerMock__factory, DCAPermissionsManagerMock } from '@typechained';
import { IDCAPermissionManager } from '@typechained/artifacts/contracts/interfaces/IDCAPermissionManager.sol/IDCAPermissionManager';
import { constants, wallet, behaviours } from '@test-utils';
import { given, then, when, contract } from '@test-utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { snapshot } from '@test-utils/evm';
import { Permission } from 'js-lib/types';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { getInstancesOfEvent, readArgFromEventOrFail } from '@test-utils/event-utils';
import { Wallet } from '@ethersproject/wallet';
import { BigNumber } from '@ethersproject/bignumber';
import { _TypedDataEncoder } from '@ethersproject/hash';
import { fromRpcSig } from 'ethereumjs-util';
import { BigNumberish } from 'ethers';

contract('DCAPermissionsManager', () => {
  const NFT_NAME = 'Balmy - DCA Position';
  const NFT_DESCRIPTOR = wallet.generateRandomAddress();
  let hub: SignerWithAddress, governor: SignerWithAddress;
  let DCAPermissionsManagerFactory: DCAPermissionsManagerMock__factory;
  let DCAPermissionsManager: DCAPermissionsManagerMock;
  let snapshotId: string;
  let chainId: BigNumber;

  before('Setup accounts and contracts', async () => {
    [hub, governor] = await ethers.getSigners();
    DCAPermissionsManagerFactory = await ethers.getContractFactory(
      'contracts/mocks/DCAPermissionsManager/DCAPermissionsManager.sol:DCAPermissionsManagerMock'
    );
    DCAPermissionsManager = await DCAPermissionsManagerFactory.deploy(governor.address, NFT_DESCRIPTOR);
    await DCAPermissionsManager.setHub(hub.address);
    snapshotId = await snapshot.take();
    chainId = BigNumber.from((await ethers.provider.getNetwork()).chainId);
  });

  beforeEach('Deploy and configure', async () => {
    await snapshot.revert(snapshotId);
  });

  describe('constructor', () => {
    let DCAPermissionsManager: DCAPermissionsManagerMock;
    given(async () => {
      DCAPermissionsManager = await DCAPermissionsManagerFactory.deploy(governor.address, NFT_DESCRIPTOR);
    });
    when('manager is deployed', () => {
      then('hub is zero address', async () => {
        const hub = await DCAPermissionsManager.hub();
        expect(hub).to.equal(constants.ZERO_ADDRESS);
      });
      then('name is correct', async () => {
        const name = await DCAPermissionsManager.name();
        expect(name).to.equal(NFT_NAME);
      });
      then('symbol is correct', async () => {
        const symbol = await DCAPermissionsManager.symbol();
        expect(symbol).to.equal('BALMY-DCA-P');
      });
      then('burn counter starts at 0', async () => {
        expect(await DCAPermissionsManager.burnCounter()).to.equal(0);
      });
      then('initial nonce is 0', async () => {
        expect(await DCAPermissionsManager.nonces(hub.address)).to.equal(0);
      });
      then('NFT descriptor is set', async () => {
        expect(await DCAPermissionsManager.nftDescriptor()).to.equal(NFT_DESCRIPTOR);
      });
      then('domain separator is the expected', async () => {
        expect(await DCAPermissionsManager.DOMAIN_SEPARATOR()).to.equal(
          await domainSeparator(NFT_NAME, '2', chainId, DCAPermissionsManager.address)
        );
      });
    });
    when('nft descriptor is zero address', () => {
      then('tx is reverted with reason error', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: DCAPermissionsManagerFactory,
          args: [constants.NOT_ZERO_ADDRESS, constants.ZERO_ADDRESS],
          message: 'ZeroAddress',
        });
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
        DCAPermissionsManager = await DCAPermissionsManagerFactory.deploy(governor.address, NFT_DESCRIPTOR);
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

  describe('hasPermissions', () => {
    const TOKEN_ID = 1;
    when('checking permisisons for the owner', () => {
      const OWNER = constants.NOT_ZERO_ADDRESS;
      given(async () => {
        await DCAPermissionsManager.mint(TOKEN_ID, OWNER, []);
      });
      then('they have all permissions', async () => {
        const result = await DCAPermissionsManager.hasPermissions(TOKEN_ID, OWNER, [
          Permission.INCREASE,
          Permission.REDUCE,
          Permission.WITHDRAW,
          Permission.TERMINATE,
        ]);
        expect(result).to.eql([true, true, true, true]);
      });
    });

    hasPermissionsTest({
      when: 'operator has no permissions',
      set: [],
      expected: [
        { permission: Permission.INCREASE, result: false },
        { permission: Permission.REDUCE, result: false },
        { permission: Permission.WITHDRAW, result: false },
        { permission: Permission.TERMINATE, result: false },
      ],
    });

    hasPermissionsTest({
      when: 'operator has some permissions',
      set: [Permission.REDUCE, Permission.WITHDRAW],
      expected: [
        { permission: Permission.INCREASE, result: false },
        { permission: Permission.REDUCE, result: true },
        { permission: Permission.WITHDRAW, result: true },
        { permission: Permission.TERMINATE, result: false },
      ],
    });

    hasPermissionsTest({
      when: 'operator has all permissions',
      set: [Permission.INCREASE, Permission.REDUCE, Permission.WITHDRAW, Permission.TERMINATE],
      expected: [
        { permission: Permission.INCREASE, result: true },
        { permission: Permission.REDUCE, result: true },
        { permission: Permission.WITHDRAW, result: true },
        { permission: Permission.TERMINATE, result: true },
      ],
    });

    function hasPermissionsTest({
      when: title,
      set,
      expected,
    }: {
      when: string;
      set: Permission[];
      expected: { permission: Permission; result: boolean }[];
    }) {
      const OWNER = wallet.generateRandomAddress();
      const OPERATOR = constants.NOT_ZERO_ADDRESS;
      when(title, () => {
        given(async () => {
          await DCAPermissionsManager.mint(TOKEN_ID, OWNER, [{ operator: OPERATOR, permissions: set }]);
        });
        then('result is returned correctly', async () => {
          const toCheck = expected.map(({ permission }) => permission);
          const result = await DCAPermissionsManager.hasPermissions(TOKEN_ID, OPERATOR, toCheck);
          expect(result).to.eql(expected.map(({ result }) => result));
        });
      });
    }
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

      then('owner has all permisisons', async () => {
        expect(await DCAPermissionsManager.hasPermission(TOKEN_ID, OWNER, Permission.INCREASE)).to.be.true;
        expect(await DCAPermissionsManager.hasPermission(TOKEN_ID, OWNER, Permission.REDUCE)).to.be.true;
        expect(await DCAPermissionsManager.hasPermission(TOKEN_ID, OWNER, Permission.TERMINATE)).to.be.true;
        expect(await DCAPermissionsManager.hasPermission(TOKEN_ID, OWNER, Permission.WITHDRAW)).to.be.true;
      });

      then('permissions are assigned properly', async () => {
        expect(await DCAPermissionsManager.hasPermission(TOKEN_ID, OPERATOR, Permission.WITHDRAW)).to.be.true;
      });

      then('no extra permissions are assigned', async () => {
        for (const permission of [Permission.INCREASE, Permission.REDUCE, Permission.TERMINATE]) {
          expect(await DCAPermissionsManager.hasPermission(TOKEN_ID, OPERATOR, permission)).to.be.false;
        }
      });

      then('nft is created and assigned to owner', async () => {
        const tokenOwner = await DCAPermissionsManager.ownerOf(TOKEN_ID);
        const balance = await DCAPermissionsManager.balanceOf(OWNER);
        expect(tokenOwner).to.equal(OWNER);
        expect(balance).to.equal(TOKEN_ID);
      });
    });
  });
  describe('transfer', () => {
    const TOKEN_ID = 1;
    const OPERATOR = constants.NOT_ZERO_ADDRESS;
    const NEW_OWNER = wallet.generateRandomAddress();
    const BLOCK_NUMBER = 10;
    let owner: Wallet;

    given(async () => {
      owner = await wallet.generateRandom();
      await DCAPermissionsManager.setBlockNumber(BLOCK_NUMBER); // We set a block number so that mint + transfer is done on the same block
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
      then('block number is recorded', async () => {
        expect(await DCAPermissionsManager.lastOwnershipChange(TOKEN_ID)).to.equal(BLOCK_NUMBER);
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
      let initialBurnCounter: BigNumber;
      given(async () => {
        initialBurnCounter = await DCAPermissionsManager.burnCounter();
        await DCAPermissionsManager.burn(TOKEN_ID);
      });
      then('burn counter gets increased', async () => {
        expect(await DCAPermissionsManager.burnCounter()).to.equal(initialBurnCounter.add(1));
      });
      then('nft is burned', async () => {
        const balance = await DCAPermissionsManager.balanceOf(OWNER);
        expect(balance).to.equal(0);
      });
      then('clean up is performed', async () => {
        expect(await DCAPermissionsManager.lastOwnershipChange(TOKEN_ID)).to.equal(0);
      });
      then('asking for permission reverts', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAPermissionsManager,
          func: 'hasPermission',
          args: [TOKEN_ID, OPERATOR, Permission.WITHDRAW],
          message: 'ERC721: invalid token ID',
        });
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
      initial: [{ operator: OPERATOR_1, permissions: [Permission.TERMINATE] }],
      modify: [{ operator: OPERATOR_2, permissions: [Permission.REDUCE] }],
      expected: [
        { operator: OPERATOR_1, permissions: [Permission.TERMINATE] },
        { operator: OPERATOR_2, permissions: [Permission.REDUCE] },
      ],
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
      const BLOCK_NUMBER = 500;
      when(title, () => {
        let tx: TransactionResponse;
        given(async () => {
          const owner = await wallet.generateRandom();
          await DCAPermissionsManager.mint(TOKEN_ID, owner.address, initial);
          await DCAPermissionsManager.setBlockNumber(BLOCK_NUMBER);
          tx = await DCAPermissionsManager.connect(owner).modify(TOKEN_ID, modify);
        });
        then('permissions are updated correctly', async () => {
          for (const { operator, permissions } of expected) {
            for (const permission of [Permission.INCREASE, Permission.REDUCE, Permission.TERMINATE, Permission.WITHDRAW]) {
              expect(await DCAPermissionsManager.hasPermission(TOKEN_ID, operator, permission)).to.equal(permissions.includes(permission));
            }
          }
        });
        then('token permission are updated', async () => {
          for (const { operator, permissions: expectedPermissions } of modify) {
            const { permissions, lastUpdated } = await DCAPermissionsManager.tokenPermissions(TOKEN_ID, operator);
            if (expectedPermissions.length == 0) {
              expect(lastUpdated).to.equal(0);
            } else {
              expect(lastUpdated).to.equal(BLOCK_NUMBER);
            }
            expect(permissions).to.equal(toUint8(expectedPermissions));
          }
        });
        then('event is emitted', async () => {
          const id = await readArgFromEventOrFail(tx, 'Modified', 'tokenId');
          const permissions: any = await readArgFromEventOrFail(tx, 'Modified', 'permissions');
          expect(id).to.equal(TOKEN_ID);
          expect(permissions.length).to.equal(modify.length);
          for (let i = 0; i < modify.length; i++) {
            expect(permissions[i].operator).to.equal(modify[i].operator);
            expect(permissions[i].permissions).to.eql(modify[i].permissions);
          }
        });
      });
      function toUint8(permissions: Permission[]) {
        return permissions.reduce((accum, curr) => accum + Math.pow(2, curr), 0);
      }
    }
  });

  describe('modifyMany', () => {
    const TOKEN_ID_1 = 1;
    const TOKEN_ID_2 = 2;
    const [OPERATOR_1, OPERATOR_2] = ['0x0000000000000000000000000000000000000001', '0x0000000000000000000000000000000000000002'];

    when('executing modifyMany', () => {
      given(async () => {
        const owner = await wallet.generateRandom();
        await DCAPermissionsManager.mint(TOKEN_ID_1, owner.address, []);
        await DCAPermissionsManager.mint(TOKEN_ID_2, owner.address, []);
        await DCAPermissionsManager.connect(owner).modifyMany([
          { tokenId: TOKEN_ID_1, permissionSets: [{ operator: OPERATOR_1, permissions: [Permission.TERMINATE, Permission.REDUCE] }] },
          { tokenId: TOKEN_ID_2, permissionSets: [{ operator: OPERATOR_2, permissions: [Permission.WITHDRAW] }] },
        ]);
      });
      then('modify is called correctly', async () => {
        const calls = await DCAPermissionsManager.getModifyCalls();
        expect(calls).to.have.lengthOf(2);
        expect(calls[0].tokenId).to.equal(TOKEN_ID_1);
        expect(calls[0].permissionSets).to.have.lengthOf(1);
        expect(calls[0].permissionSets[0].operator).to.equal(OPERATOR_1);
        expect(calls[0].permissionSets[0].permissions).to.eql([Permission.TERMINATE, Permission.REDUCE]);
        expect(calls[1].tokenId).to.equal(TOKEN_ID_2);
        expect(calls[1].permissionSets).to.have.lengthOf(1);
        expect(calls[1].permissionSets[0].operator).to.equal(OPERATOR_2);
        expect(calls[1].permissionSets[0].permissions).to.eql([Permission.WITHDRAW]);
      });
    });
  });

  describe('permit', () => {
    const TOKEN_ID = 1;
    const SPENDER = wallet.generateRandomAddress();
    let owner: Wallet, stranger: Wallet;

    given(async () => {
      owner = await wallet.generateRandom();
      stranger = await wallet.generateRandom();
      await DCAPermissionsManager.mint(TOKEN_ID, owner.address, []);
    });

    when(`owner tries to execute a permit`, () => {
      let response: TransactionResponse;

      given(async () => {
        response = await signAndPermit({ signer: owner, spender: SPENDER });
      });

      then('spender is registered as approved', async () => {
        expect(await DCAPermissionsManager.getApproved(TOKEN_ID)).to.be.equal(SPENDER);
      });

      then('nonces is increased', async () => {
        expect(await DCAPermissionsManager.nonces(owner.address)).to.be.equal(1);
      });

      then('event is emitted', async () => {
        await expect(response).to.emit(DCAPermissionsManager, 'Approval').withArgs(owner.address, SPENDER, TOKEN_ID);
      });
    });

    permitFailsTest({
      when: 'some stranger tries to permit',
      exec: () => signAndPermit({ signer: stranger }),
      txFailsWith: 'InvalidSignature',
    });

    permitFailsTest({
      when: 'permit is expired',
      exec: () => signAndPermit({ signer: owner, deadline: BigNumber.from(0) }),
      txFailsWith: 'ExpiredDeadline',
    });

    permitFailsTest({
      when: 'chainId is different',
      exec: () => signAndPermit({ signer: owner, chainId: BigNumber.from(20) }),
      txFailsWith: 'InvalidSignature',
    });

    permitFailsTest({
      when: 'signer signed something differently',
      exec: async () => {
        const data = withDefaults({ signer: owner, deadline: constants.MAX_UINT_256 });
        const signature = await getSignature(data);
        return permit({ ...data, deadline: constants.MAX_UINT_256.sub(1) }, signature);
      },
      txFailsWith: 'InvalidSignature',
    });

    permitFailsTest({
      when: 'signature is reused',
      exec: async () => {
        const data = withDefaults({ signer: owner });
        const signature = await getSignature(data);
        await permit(data, signature);
        return permit(data, signature);
      },
      txFailsWith: 'InvalidSignature',
    });

    function permitFailsTest({
      when: title,
      exec,
      txFailsWith: errorMessage,
    }: {
      when: string;
      exec: () => Promise<TransactionResponse>;
      txFailsWith: string;
    }) {
      when(title, () => {
        let tx: Promise<TransactionResponse>;
        given(() => {
          tx = exec();
        });
        then('tx reverts with message', async () => {
          await behaviours.checkTxRevertedWithMessage({ tx, message: errorMessage });
        });
      });
    }

    async function signAndPermit(options: Pick<OperationData, 'signer'> & Partial<OperationData>) {
      const data = withDefaults(options);
      const signature = await getSignature(data);
      return permit(data, signature);
    }

    async function permit(data: OperationData, { v, r, s }: { v: number; r: Buffer; s: Buffer }) {
      return DCAPermissionsManager.permit(data.spender, TOKEN_ID, data.deadline, v, r, s);
    }

    function withDefaults(options: Pick<OperationData, 'signer'> & Partial<OperationData>): OperationData {
      return {
        nonce: BigNumber.from(0),
        deadline: constants.MAX_UINT_256,
        spender: SPENDER,
        chainId,
        ...options,
      };
    }

    const Permit = [
      { name: 'spender', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ];

    async function getSignature(options: OperationData) {
      const { domain, types, value } = buildPermitData(options);
      const signature = await options.signer._signTypedData(domain, types, value);
      return fromRpcSig(signature);
    }

    function buildPermitData(options: OperationData) {
      return {
        primaryType: 'Permit',
        types: { Permit },
        domain: { name: NFT_NAME, version: '2', chainId: options.chainId, verifyingContract: DCAPermissionsManager.address },
        value: { tokenId: TOKEN_ID, ...options },
      };
    }

    type OperationData = {
      signer: Wallet;
      spender: string;
      nonce: BigNumber;
      deadline: BigNumber;
      chainId: BigNumber;
    };
  });

  describe('permissionPermit', () => {
    const TOKEN_ID = 1;
    const OPERATOR = wallet.generateRandomAddress();
    let owner: Wallet, stranger: Wallet;

    given(async () => {
      owner = await wallet.generateRandom();
      stranger = await wallet.generateRandom();
      await DCAPermissionsManager.mint(TOKEN_ID, owner.address, []);
    });

    function permitTest({ when: title, permissions }: { when: string; permissions: Permission[] }) {
      when(title, () => {
        let tx: TransactionResponse;

        given(async () => {
          tx = await signAndPermit({ signer: owner, permissions: [{ operator: OPERATOR, permissions }] });
        });

        then('operator gains permissions', async () => {
          for (const permission of permissions) {
            expect(await DCAPermissionsManager.hasPermission(TOKEN_ID, OPERATOR, permission)).to.be.true;
          }
        });

        then('nonces is increased', async () => {
          expect(await DCAPermissionsManager.nonces(owner.address)).to.be.equal(1);
        });

        then('event is emitted', async () => {
          const id = await readArgFromEventOrFail(tx, 'Modified', 'tokenId');
          const emittedPermissions: any = await readArgFromEventOrFail(tx, 'Modified', 'permissions');
          expect(id).to.equal(TOKEN_ID);
          expect(emittedPermissions.length).to.equal(1);
          expect(emittedPermissions[0].operator).to.equal(OPERATOR);
          expect(emittedPermissions[0].permissions).to.eql(permissions);
        });
      });
    }

    permitTest({
      when: `setting only one permission`,
      permissions: [Permission.INCREASE],
    });

    permitTest({
      when: `setting two permissions`,
      permissions: [Permission.REDUCE, Permission.TERMINATE],
    });

    permitTest({
      when: `setting three permissions`,
      permissions: [Permission.REDUCE, Permission.WITHDRAW, Permission.INCREASE],
    });

    permitTest({
      when: `setting all permissions`,
      permissions: [Permission.INCREASE, Permission.REDUCE, Permission.WITHDRAW, Permission.TERMINATE],
    });

    permitFailsTest({
      when: 'some stranger tries to permit',
      exec: () => signAndPermit({ signer: stranger }),
      txFailsWith: 'InvalidSignature',
    });

    permitFailsTest({
      when: 'permit is expired',
      exec: () => signAndPermit({ signer: owner, deadline: BigNumber.from(0) }),
      txFailsWith: 'ExpiredDeadline',
    });

    permitFailsTest({
      when: 'chainId is different',
      exec: () => signAndPermit({ signer: owner, chainId: BigNumber.from(20) }),
      txFailsWith: 'InvalidSignature',
    });

    permitFailsTest({
      when: 'signer signed something differently',
      exec: async () => {
        const data = withDefaults({ signer: owner, deadline: constants.MAX_UINT_256 });
        const signature = await getSignature(data);
        return permissionPermit({ ...data, deadline: constants.MAX_UINT_256.sub(1) }, signature);
      },
      txFailsWith: 'InvalidSignature',
    });

    permitFailsTest({
      when: 'signature is reused',
      exec: async () => {
        const data = withDefaults({ signer: owner });
        const signature = await getSignature(data);
        await permissionPermit(data, signature);
        return permissionPermit(data, signature);
      },
      txFailsWith: 'InvalidSignature',
    });

    function permitFailsTest({
      when: title,
      exec,
      txFailsWith: errorMessage,
    }: {
      when: string;
      exec: () => Promise<TransactionResponse>;
      txFailsWith: string;
    }) {
      when(title, () => {
        let tx: Promise<TransactionResponse>;
        given(() => {
          tx = exec();
        });
        then('tx reverts with message', async () => {
          await behaviours.checkTxRevertedWithMessage({ tx, message: errorMessage });
        });
      });
    }

    async function signAndPermit(options: Pick<OperationData, 'signer'> & Partial<OperationData>) {
      const data = withDefaults(options);
      const signature = await getSignature(data);
      return permissionPermit(data, signature);
    }

    async function permissionPermit(data: OperationData, { v, r, s }: { v: number; r: Buffer; s: Buffer }) {
      return DCAPermissionsManager.permissionPermit(data.permissions, TOKEN_ID, data.deadline, v, r, s);
    }

    function withDefaults(options: Pick<OperationData, 'signer'> & Partial<OperationData>): OperationData {
      return {
        nonce: BigNumber.from(0),
        deadline: constants.MAX_UINT_256,
        permissions: [],
        chainId,
        ...options,
      };
    }

    const PermissionSet = [
      { name: 'operator', type: 'address' },
      { name: 'permissions', type: 'uint8[]' },
    ];

    const PermissionPermit = [
      { name: 'permissions', type: 'PermissionSet[]' },
      { name: 'tokenId', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ];

    async function getSignature(options: OperationData) {
      const { domain, types, value } = buildPermitData(options);
      const signature = await options.signer._signTypedData(domain, types, value);
      return fromRpcSig(signature);
    }

    function buildPermitData(options: OperationData) {
      return {
        primaryType: 'PermissionPermit',
        types: { PermissionSet, PermissionPermit },
        domain: { name: NFT_NAME, version: '2', chainId: options.chainId, verifyingContract: DCAPermissionsManager.address },
        value: { tokenId: TOKEN_ID, ...options },
      };
    }

    type OperationData = {
      signer: Wallet;
      permissions: { operator: string; permissions: Permission[] }[];
      nonce: BigNumber;
      deadline: BigNumber;
      chainId: BigNumber;
    };
  });

  describe('multiPermissionPermit', () => {
    const [TOKEN_ID_1, TOKEN_ID_2, TOKEN_ID_3] = [1, 2, 3];
    const OPERATOR = wallet.generateRandomAddress();
    let owner: Wallet, stranger: Wallet;

    given(async () => {
      owner = await wallet.generateRandom();
      stranger = await wallet.generateRandom();
      await DCAPermissionsManager.mint(TOKEN_ID_1, owner.address, []);
      await DCAPermissionsManager.mint(TOKEN_ID_2, owner.address, []);
      await DCAPermissionsManager.mint(TOKEN_ID_3, stranger.address, []);
    });

    multiPermissionPermitTest({
      when: 'setting only one permission',
      positions: [{ tokenId: TOKEN_ID_1, permissions: [Permission.INCREASE] }],
    });

    multiPermissionPermitTest({
      when: 'setting two permissions',
      positions: [
        { tokenId: TOKEN_ID_1, permissions: [Permission.INCREASE, Permission.WITHDRAW] },
        { tokenId: TOKEN_ID_2, permissions: [Permission.REDUCE, Permission.TERMINATE] },
      ],
    });

    multiPermissionPermitTest({
      when: 'setting three permissions',
      positions: [
        { tokenId: TOKEN_ID_1, permissions: [Permission.INCREASE, Permission.WITHDRAW, Permission.TERMINATE] },
        { tokenId: TOKEN_ID_2, permissions: [Permission.REDUCE, Permission.TERMINATE, Permission.INCREASE] },
      ],
    });

    multiPermissionPermitTest({
      when: 'setting all permissions',
      positions: [
        { tokenId: TOKEN_ID_1, permissions: [Permission.INCREASE, Permission.REDUCE, Permission.WITHDRAW, Permission.TERMINATE] },
        { tokenId: TOKEN_ID_2, permissions: [Permission.INCREASE, Permission.REDUCE, Permission.WITHDRAW, Permission.TERMINATE] },
      ],
    });

    multiPermitFailsTest({
      when: 'no positions are passed',
      exec: () => signAndPermit({ signer: stranger, positions: [] }),
      txFailsWith:
        'VM Exception while processing transaction: reverted with panic code 0x32 (Array accessed at an out-of-bounds or negative index)',
    });

    multiPermitFailsTest({
      when: 'some stranger tries to permit',
      exec: () => signAndPermit({ signer: stranger }),
      txFailsWith: 'InvalidSignature',
    });

    multiPermitFailsTest({
      when: 'permit is expired',
      exec: () => signAndPermit({ signer: owner, deadline: BigNumber.from(0) }),
      txFailsWith: 'ExpiredDeadline',
    });

    multiPermitFailsTest({
      when: 'chainId is different',
      exec: () => signAndPermit({ signer: owner, chainId: BigNumber.from(20) }),
      txFailsWith: 'InvalidSignature',
    });

    multiPermitFailsTest({
      when: 'signer signed something differently',
      exec: async () => {
        const data = withDefaults({ signer: owner, deadline: constants.MAX_UINT_256 });
        const signature = await getSignature(data);
        return permissionPermit({ ...data, deadline: constants.MAX_UINT_256.sub(1) }, signature);
      },
      txFailsWith: 'InvalidSignature',
    });

    multiPermitFailsTest({
      when: 'signature is reused',
      exec: async () => {
        const data = withDefaults({ signer: owner });
        const signature = await getSignature(data);
        await permissionPermit(data, signature);
        return permissionPermit(data, signature);
      },
      txFailsWith: 'InvalidSignature',
    });

    multiPermitFailsTest({
      when: 'signers tries to modify a position that is not theirs',
      exec: () =>
        signAndPermit({
          signer: owner,
          positions: [
            { tokenId: TOKEN_ID_1, permissionSets: [] }, // Belongs to signer
            { tokenId: TOKEN_ID_3, permissionSets: [] }, // Does not belong to signer
          ],
        }),
      txFailsWith: 'NotOwner',
    });

    function multiPermissionPermitTest({
      when: title,
      positions,
    }: {
      when: string;
      positions: { tokenId: BigNumberish; permissions: Permission[] }[];
    }) {
      when(title, () => {
        let tx: TransactionResponse;

        given(async () => {
          const input = positions.map(({ tokenId, permissions }) => ({ tokenId, permissionSets: [{ operator: OPERATOR, permissions }] }));
          tx = await signAndPermit({ signer: owner, positions: input });
        });

        then('operator gains permissions', async () => {
          for (const { tokenId, permissions } of positions) {
            for (const permission of permissions) {
              expect(await DCAPermissionsManager.hasPermission(tokenId, OPERATOR, permission)).to.be.true;
            }
          }
        });

        then('nonces is increased', async () => {
          expect(await DCAPermissionsManager.nonces(owner.address)).to.be.equal(1);
        });

        then('event is emitted', async () => {
          const events = await getInstancesOfEvent(tx, 'Modified');
          expect(events).to.have.lengthOf(positions.length);
          for (let i = 0; i < positions.length; i++) {
            const { tokenId, permissions } = events[i].args;
            expect(tokenId).to.equal(positions[i].tokenId);
            expect(permissions).to.have.lengthOf(1);
            expect(permissions[0].operator).to.equal(OPERATOR);
            expect(permissions[0].permissions).to.eql(positions[i].permissions);
          }
        });
      });
    }

    function multiPermitFailsTest({
      when: title,
      exec,
      txFailsWith: errorMessage,
    }: {
      when: string;
      exec: () => Promise<TransactionResponse>;
      txFailsWith: string;
    }) {
      when(title, () => {
        let tx: Promise<TransactionResponse>;
        given(() => {
          tx = exec();
        });
        then('tx reverts with message', async () => {
          await behaviours.checkTxRevertedWithMessage({ tx, message: errorMessage });
        });
      });
    }

    async function signAndPermit(options: Pick<OperationData, 'signer'> & Partial<OperationData>) {
      const data = withDefaults(options);
      const signature = await getSignature(data);
      return permissionPermit(data, signature);
    }

    async function permissionPermit(data: OperationData, { v, r, s }: { v: number; r: Buffer; s: Buffer }) {
      return DCAPermissionsManager.multiPermissionPermit(data.positions, data.deadline, v, r, s);
    }

    function withDefaults(options: Pick<OperationData, 'signer'> & Partial<OperationData>): OperationData {
      return {
        nonce: BigNumber.from(0),
        deadline: constants.MAX_UINT_256,
        positions: [{ tokenId: TOKEN_ID_1, permissionSets: [] }],
        chainId,
        ...options,
      };
    }

    const PermissionSet = [
      { name: 'operator', type: 'address' },
      { name: 'permissions', type: 'uint8[]' },
    ];

    const PositionPermissions = [
      { name: 'tokenId', type: 'uint256' },
      { name: 'permissionSets', type: 'PermissionSet[]' },
    ];

    const MultiPermissionPermit = [
      { name: 'positions', type: 'PositionPermissions[]' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ];

    async function getSignature(options: OperationData) {
      const { domain, types, value } = buildPermitData(options);
      const signature = await options.signer._signTypedData(domain, types, value);
      return fromRpcSig(signature);
    }

    function buildPermitData(options: OperationData) {
      return {
        primaryType: 'MultiPermissionPermit',
        types: { MultiPermissionPermit, PositionPermissions, PermissionSet },
        domain: { name: NFT_NAME, version: '2', chainId: options.chainId, verifyingContract: DCAPermissionsManager.address },
        value: { ...options },
      };
    }

    type OperationData = {
      signer: Wallet;
      positions: IDCAPermissionManager.PositionPermissionsStruct[];
      nonce: BigNumber;
      deadline: BigNumber;
      chainId: BigNumber;
    };
  });

  describe('setNFTDescriptor', () => {
    when('address is zero', () => {
      then('tx is reverted with reason', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAPermissionsManager.connect(governor),
          func: 'setNFTDescriptor',
          args: [constants.ZERO_ADDRESS],
          message: 'ZeroAddress',
        });
      });
    });
    when('address is not zero', () => {
      then('sets nftDescriptor and emits event with correct arguments', async () => {
        await behaviours.txShouldSetVariableAndEmitEvent({
          contract: DCAPermissionsManager.connect(governor),
          getterFunc: 'nftDescriptor',
          setterFunc: 'setNFTDescriptor',
          variable: constants.NOT_ZERO_ADDRESS,
          eventEmitted: 'NFTDescriptorSet',
        });
      });
    });

    behaviours.shouldBeExecutableOnlyByGovernor({
      contract: () => DCAPermissionsManager,
      funcAndSignature: 'setNFTDescriptor(address)',
      params: [constants.NOT_ZERO_ADDRESS],
      governor: () => governor,
    });
  });

  const EIP712Domain = [
    { name: 'name', type: 'string' },
    { name: 'version', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'verifyingContract', type: 'address' },
  ];

  async function domainSeparator(name: string, version: string, chainId: BigNumber, verifyingContract: string) {
    return _TypedDataEncoder.hashStruct('EIP712Domain', { EIP712Domain }, { name, version, chainId, verifyingContract });
  }
});
