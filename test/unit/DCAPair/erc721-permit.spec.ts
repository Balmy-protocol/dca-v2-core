import { BigNumber, Contract, ContractFactory } from 'ethers';
import { ethers } from 'hardhat';
import { expect } from 'chai';
import { _TypedDataEncoder } from '@ethersproject/hash';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { when, then, given } from '../../utils/bdd';
import { constants, behaviours } from '../../utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';
import { fromRpcSig } from 'ethereumjs-util';

describe('ERC721Permit', () => {
  const NAME = 'name';
  const TOKEN_ID = BigNumber.from(1);

  let owner: SignerWithAddress, approved: SignerWithAddress, approved2: SignerWithAddress, stranger: SignerWithAddress;
  let ERC721PermitContract: ContractFactory;
  let ERC721Permit: Contract;
  let chainId: BigNumber;

  before('Setup accounts and contracts', async () => {
    [owner, approved, approved2, stranger] = await ethers.getSigners();
    ERC721PermitContract = await ethers.getContractFactory('contracts/mocks/DCAPair/ERC721Permit.sol:ERC721PermitMock');
    chainId = BigNumber.from((await ethers.provider.getNetwork()).chainId);
  });

  beforeEach('Deploy and configure', async () => {
    ERC721Permit = await ERC721PermitContract.deploy(NAME);
    await ERC721Permit.mint(owner.address, TOKEN_ID);
  });

  describe('constructor', () => {
    when('contract is initiated', () => {
      then('initial nonce is 0', async () => {
        expect(await ERC721Permit.nonces(owner.address)).to.equal(0);
      });

      then('domain separator is the expected', async () => {
        expect(await ERC721Permit.DOMAIN_SEPARATOR()).to.equal(await domainSeparator(NAME, '1', chainId, ERC721Permit.address));
      });
    });
  });

  describe('permit', () => {
    when(`owner tries to permit an operator`, () => {
      let response: TransactionResponse;

      given(async () => {
        response = await signAndPermit({ operator: approved });
      });

      then('operator is registered as approved', async () => {
        expect(await ERC721Permit.getApproved(TOKEN_ID)).to.be.equal(approved.address);
      });

      then('nonces is increased', async () => {
        expect(await ERC721Permit.nonces(owner.address)).to.be.equal(1);
      });

      then('event is emitted', async () => {
        await expect(response).to.emit(ERC721Permit, 'Approval').withArgs(owner.address, approved.address, TOKEN_ID);
      });
    });

    when(`approved for all operator tries to permit another operator`, () => {
      let response: TransactionResponse;

      given(async () => {
        await ERC721Permit.setApprovalForAll(approved.address, true);
        response = await signAndPermit({ signer: approved, operator: approved2 });
      });

      then('new operator is registered as approved', async () => {
        expect(await ERC721Permit.getApproved(TOKEN_ID)).to.be.equal(approved2.address);
      });

      then('nonces is increased for original operator', async () => {
        expect(await ERC721Permit.nonces(approved.address)).to.be.equal(1);
      });

      then('nonces is not increased for owner', async () => {
        expect(await ERC721Permit.nonces(owner.address)).to.be.equal(0);
      });

      then('event is emitted', async () => {
        await expect(response).to.emit(ERC721Permit, 'Approval').withArgs(owner.address, approved2.address, TOKEN_ID);
      });
    });

    testTxIsReverted({
      when: 'some stranger tries to permit',
      exec: () => {
        return signAndPermit({ signer: stranger });
      },
      errorMessage: 'ERC721Permit: signer is not owner nor approved for all',
    });

    testTxIsReverted({
      when: 'permit is expired',
      exec: () => {
        return signAndPermit({ signer: owner, deadline: BigNumber.from(0) });
      },
      errorMessage: 'ERC721Permit: expired deadline',
    });

    testTxIsReverted({
      when: `actual signer doesn't match the provided signer`,
      exec: async () => {
        const data = withDefaults({ signer: owner });
        const signature = await getSignature(data);
        return permit({ ...data, signer: stranger }, signature);
      },
      errorMessage: 'ERC721Permit: invalid signature',
    });

    testTxIsReverted({
      when: 'signer signed something differently',
      exec: async () => {
        const data = withDefaults({ deadline: constants.MAX_UINT_256 });
        const signature = await getSignature(data);
        return permit({ ...data, deadline: constants.MAX_UINT_256.sub(1) }, signature);
      },
      errorMessage: 'ERC721Permit: invalid signature',
    });

    testTxIsReverted({
      when: 'signature is reused',
      exec: async () => {
        const data = withDefaults({ operator: approved });
        const signature = await getSignature(data);
        await permit(data, signature);
        return permit(data, signature);
      },
      errorMessage: 'ERC721Permit: invalid signature',
    });
  });

  describe('permitForAll', () => {
    when(`owner tries to permit an operator`, () => {
      let response: TransactionResponse;

      given(async () => {
        response = await signAndPermitForAll({ operator: approved });
      });

      then('operator is registered as approved for all', async () => {
        expect(await ERC721Permit.isApprovedForAll(owner.address, approved.address)).to.be.true;
      });

      then('nonces is increased', async () => {
        expect(await ERC721Permit.nonces(owner.address)).to.be.equal(1);
      });

      then('event is emitted', async () => {
        await expect(response).to.emit(ERC721Permit, 'ApprovalForAll').withArgs(owner.address, approved.address, true);
      });
    });

    when(`owner uses permit to remove approval for all`, () => {
      let response: TransactionResponse;

      given(async () => {
        await signAndPermitForAll({ operator: approved });
        response = await signAndPermitForAll({ operator: approved, approved: false, nonce: BigNumber.from(1) });
      });

      then('operator is no longer registered as approved for all', async () => {
        expect(await ERC721Permit.isApprovedForAll(owner.address, approved.address)).to.be.false;
      });

      then('nonces is increased', async () => {
        expect(await ERC721Permit.nonces(owner.address)).to.be.equal(2);
      });

      then('event is emitted', async () => {
        await expect(response).to.emit(ERC721Permit, 'ApprovalForAll').withArgs(owner.address, approved.address, false);
      });
    });

    testTxIsReverted({
      when: 'permit is expired',
      exec: () => {
        return signAndPermitForAll({ signer: owner, deadline: BigNumber.from(0) });
      },
      errorMessage: 'ERC721Permit: expired deadline',
    });

    testTxIsReverted({
      when: 'operator is zero address',
      exec: async () => {
        const data = withDefaults({ signer: owner });
        const { v, r, s } = await getSignatureForAll(data);
        return ERC721Permit.permitForAll(data.signer.address, constants.ZERO_ADDRESS, data.approved, data.deadline, v, r, s);
      },
      errorMessage: 'ERC721Permit: operator cannot be the zero address',
    });

    testTxIsReverted({
      when: `actual signer doesn't match the owner`,
      exec: async () => {
        const data = withDefaults({ signer: owner });
        const signature = await getSignatureForAll(data);
        return permitForAll({ ...data, signer: stranger }, signature);
      },
      errorMessage: 'ERC721Permit: invalid signature',
    });

    testTxIsReverted({
      when: 'signer signed something differently',
      exec: async () => {
        const data = withDefaults({ deadline: constants.MAX_UINT_256 });
        const signature = await getSignature(data);
        return permitForAll({ ...data, deadline: constants.MAX_UINT_256.sub(1) }, signature);
      },
      errorMessage: 'ERC721Permit: invalid signature',
    });

    testTxIsReverted({
      when: 'owners try to permit themselves as operators',
      exec: () => {
        return signAndPermitForAll({ signer: owner, operator: owner });
      },
      errorMessage: 'ERC721Permit: operator cannot be same as owner',
    });
  });

  function testTxIsReverted({
    when: title,
    exec,
    errorMessage,
  }: {
    when: string;
    exec: () => Promise<TransactionResponse>;
    errorMessage: string;
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

  async function signAndPermitForAll(options?: Partial<PermitForAllData & OperationData>) {
    const data = withDefaults(options);
    const signature = await getSignatureForAll(data);
    return permitForAll(data, signature);
  }

  async function permitForAll(data: PermitForAllData & OperationData, { v, r, s }: { v: number; r: Buffer; s: Buffer }) {
    return ERC721Permit.permitForAll(data.signer.address, data.operator.address, data.approved, data.deadline, v, r, s);
  }

  async function signAndPermit(options?: Partial<OperationData>) {
    const data = withDefaults(options);
    const signature = await getSignature(data);
    return permit(data, signature);
  }

  async function permit(data: OperationData, { v, r, s }: { v: number; r: Buffer; s: Buffer }) {
    return ERC721Permit.permit(data.signer.address, data.operator.address, TOKEN_ID, data.deadline, v, r, s);
  }

  function withDefaults(options?: Partial<OperationData & PermitForAllData>): OperationData & PermitForAllData {
    return {
      signer: owner,
      operator: approved,
      nonce: BigNumber.from(0),
      deadline: constants.MAX_UINT_256,
      approved: true,
      ...options,
    };
  }

  const EIP712Domain = [
    { name: 'name', type: 'string' },
    { name: 'version', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'verifyingContract', type: 'address' },
  ];

  const Permit = [
    { name: 'signer', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'tokenId', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ];

  const PermitForAll = [
    { name: 'owner', type: 'address' },
    { name: 'operator', type: 'address' },
    { name: 'approved', type: 'bool' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ];

  async function domainSeparator(name: string, version: string, chainId: BigNumber, verifyingContract: string) {
    return _TypedDataEncoder.hashStruct('EIP712Domain', { EIP712Domain }, { name, version, chainId, verifyingContract });
  }

  async function getSignatureForAll(options: PermitForAllData & OperationData) {
    const { domain, types, value } = buildPermitForAllData(options);
    const signature = await options.signer._signTypedData(domain, types, value);
    return fromRpcSig(signature);
  }

  async function getSignature(options: OperationData) {
    const { domain, types, value } = buildPermitData(options);
    const signature = await options.signer._signTypedData(domain, types, value);
    return fromRpcSig(signature);
  }

  function buildPermitData(options: OperationData) {
    return {
      primaryType: 'Permit',
      types: { Permit },
      domain: { name: NAME, version: '1', chainId, verifyingContract: ERC721Permit.address },
      value: { tokenId: TOKEN_ID, ...options, to: options.operator.address, signer: options.signer.address },
    };
  }

  function buildPermitForAllData(options: PermitForAllData & OperationData) {
    return {
      primaryType: 'PermitForAll',
      types: { PermitForAll },
      domain: { name: NAME, version: '1', chainId, verifyingContract: ERC721Permit.address },
      value: { ...options, operator: options.operator.address, owner: options.signer.address },
    };
  }
});

type PermitForAllData = {
  approved: boolean;
};

type OperationData = {
  signer: SignerWithAddress;
  operator: SignerWithAddress;
  nonce: BigNumber;
  deadline: BigNumber;
};
