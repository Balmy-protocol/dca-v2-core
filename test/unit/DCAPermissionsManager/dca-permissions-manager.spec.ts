import { expect } from 'chai';
import { ethers } from 'hardhat';
import { DCAPermissionsManager__factory, DCAPermissionsManager } from '@typechained';
import { constants, wallet, behaviours } from '@test-utils';
import { given, then, when, contract } from '@test-utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { snapshot } from '@test-utils/evm';
import { Permission } from 'js-lib/types';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { readArgFromEventOrFail } from '@test-utils/event-utils';
import { Wallet } from '@ethersproject/wallet';
import { BigNumber } from '@ethersproject/bignumber';
import { _TypedDataEncoder } from '@ethersproject/hash';
import { fromRpcSig } from 'ethereumjs-util';

contract('DCAPermissionsManager', () => {
  const NFT_NAME = 'Mean Finance DCA';
  const NFT_DESCRIPTOR = wallet.generateRandomAddress();
  let hub: SignerWithAddress, governor: SignerWithAddress;
  let DCAPermissionsManagerFactory: DCAPermissionsManager__factory;
  let DCAPermissionsManager: DCAPermissionsManager;
  let snapshotId: string;
  let chainId: BigNumber;

  before('Setup accounts and contracts', async () => {
    [hub, governor] = await ethers.getSigners();
    DCAPermissionsManagerFactory = await ethers.getContractFactory(
      'contracts/DCAPermissionsManager/DCAPermissionsManager.sol:DCAPermissionsManager'
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
    let DCAPermissionsManager: DCAPermissionsManager;
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
        expect(symbol).to.equal('DCA');
      });
      then('initial nonce is 0', async () => {
        expect(await DCAPermissionsManager.nonces(hub.address)).to.equal(0);
      });
      then('NFT descriptor is set', async () => {
        expect(await DCAPermissionsManager.nftDescriptor()).to.equal(NFT_DESCRIPTOR);
      });
      then('domain separator is the expected', async () => {
        expect(await DCAPermissionsManager.DOMAIN_SEPARATOR()).to.equal(
          await domainSeparator(NFT_NAME, '1', chainId, DCAPermissionsManager.address)
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
      let DCAPermissionsManager: DCAPermissionsManager;
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
      when(title, () => {
        let tx: TransactionResponse;
        given(async () => {
          const owner = await wallet.generateRandom();
          await DCAPermissionsManager.mint(TOKEN_ID, owner.address, initial);
          tx = await DCAPermissionsManager.connect(owner).modify(TOKEN_ID, modify);
        });
        then('then permissions are updated correctly', async () => {
          for (const { operator, permissions } of expected) {
            for (const permission of [Permission.INCREASE, Permission.REDUCE, Permission.TERMINATE, Permission.WITHDRAW]) {
              expect(await DCAPermissionsManager.hasPermission(TOKEN_ID, operator, permission)).to.equal(permissions.includes(permission));
            }
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
    }
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
        domain: { name: NFT_NAME, version: '1', chainId: options.chainId, verifyingContract: DCAPermissionsManager.address },
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

    when(`owner tries to execute a permission permit`, () => {
      let tx: TransactionResponse;

      given(async () => {
        tx = await signAndPermit({ signer: owner, permissions: [{ operator: OPERATOR, permissions: [Permission.TERMINATE] }] });
      });

      then('operator gains permission', async () => {
        expect(await DCAPermissionsManager.hasPermission(TOKEN_ID, OPERATOR, Permission.TERMINATE)).to.be.true;
      });

      then('nonces is increased', async () => {
        expect(await DCAPermissionsManager.nonces(owner.address)).to.be.equal(1);
      });

      then('event is emitted', async () => {
        const id = await readArgFromEventOrFail(tx, 'Modified', 'tokenId');
        const permissions: any = await readArgFromEventOrFail(tx, 'Modified', 'permissions');
        expect(id).to.equal(TOKEN_ID);
        expect(permissions.length).to.equal(1);
        expect(permissions[0].operator).to.equal(OPERATOR);
        expect(permissions[0].permissions).to.eql([Permission.TERMINATE]);
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
        domain: { name: NFT_NAME, version: '1', chainId: options.chainId, verifyingContract: DCAPermissionsManager.address },
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
