import { BigNumber, Contract, ContractFactory } from 'ethers';
import { ethers } from 'hardhat';
import { expect } from 'chai';
import { _TypedDataEncoder } from '@ethersproject/hash';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { when, then, given } from '../../../utils/bdd';
import { constants, behaviours } from '../../../utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';

describe('ERC721Batch', () => {
  const NAME = 'name';
  const TOKEN_ID_1 = BigNumber.from(1);
  const TOKEN_ID_2 = BigNumber.from(2);

  let owner: SignerWithAddress, approved: SignerWithAddress, to: SignerWithAddress, stranger: SignerWithAddress;
  let ERC721BatchContract: ContractFactory;
  let ERC721Batch: Contract;

  before('Setup accounts and contracts', async () => {
    [owner, approved, to, stranger] = await ethers.getSigners();
    ERC721BatchContract = await ethers.getContractFactory('contracts/mocks/DCAPair/ERC721/ERC721Batch.sol:ERC721BatchMock');
  });

  beforeEach('Deploy and configure', async () => {
    ERC721Batch = await ERC721BatchContract.deploy(NAME);
    await ERC721Batch.mint(owner.address, TOKEN_ID_1);
    await ERC721Batch.mint(owner.address, TOKEN_ID_2);
  });

  describe('safeBatchTransferFrom', () => {
    testBatchTransferWorks({
      when: 'transfer is called by owner',
      from: () => owner,
      to: () => to,
      ids: [TOKEN_ID_1],
    });

    testBatchTransferWorks({
      when: 'transfer is called by approved for all operator',
      from: () => owner,
      to: () => to,
      beforeTransfer: () => ERC721Batch.setApprovalForAll(approved.address, true),
      signer: approved,
      ids: [TOKEN_ID_1],
    });

    testBatchTransferWorks({
      when: 'transfer is called by approved token operator',
      from: () => owner,
      to: () => to,
      beforeTransfer: () => ERC721Batch.approve(approved.address, TOKEN_ID_1),
      signer: approved,
      ids: [TOKEN_ID_1],
    });

    testBatchTransferWorks({
      when: 'many tokens are transferred',
      from: () => owner,
      to: () => to,
      signer: owner,
      ids: [TOKEN_ID_1, TOKEN_ID_2],
    });

    testTxIsReverted({
      when: 'to is zero address',
      exec: () => batchTransfer({ from: owner, to: constants.ZERO_ADDRESS, ids: [TOKEN_ID_1] }),
      errorMessage: 'ERC721Batch: transfer to the zero address',
    });

    testTxIsReverted({
      when: 'no ids are sent',
      exec: () => batchTransfer({ from: owner, to, ids: [] }),
      errorMessage: 'ERC721Batch: you need to transfer at least one token',
    });

    testTxIsReverted({
      when: `one of the tokens isn't owned or approved`,
      exec: async () => {
        const TOKEN_ID_3 = BigNumber.from(3);
        await ERC721Batch.mint(stranger.address, TOKEN_ID_3);
        return batchTransfer({ from: owner, to, ids: [TOKEN_ID_1, TOKEN_ID_3] });
      },
      errorMessage: 'ERC721Batch: transfer caller is not owner nor approved',
    });

    testTxIsReverted({
      when: 'receiver is a contact that does implement ERC721Receiver',
      exec: () => batchTransfer({ from: owner, to: ERC721Batch.address, ids: [TOKEN_ID_1] }),
      errorMessage: 'ERC721: transfer to non ERC721Receiver implementer',
    });
  });

  function testBatchTransferWorks({
    when: title,
    from,
    to,
    ids,
    beforeTransfer,
    signer,
  }: {
    when: string;
    from: () => SignerWithAddress | string;
    to: () => SignerWithAddress | string;
    ids: BigNumber[];
    signer?: SignerWithAddress;
    beforeTransfer?: () => Promise<TransactionResponse>;
  }) {
    when(title, () => {
      let response: TransactionResponse;

      given(async () => {
        if (beforeTransfer) {
          await beforeTransfer();
        }
        response = await batchTransfer({ from: from(), to: to(), ids, signer });
      });

      then('ownership is changed', async () => {
        for (const tokenId of ids) {
          expect(await ERC721Batch.ownerOf(tokenId)).to.be.equal(getAddress(to()));
        }
      });

      then('balanceOf is increased', async () => {
        expect(await ERC721Batch.balanceOf(getAddress(to()))).to.be.equal(ids.length);
      });

      then(`token's approval is now zero-address`, async () => {
        for (const tokenId of ids) {
          expect(await ERC721Batch.getApproved(tokenId)).to.be.equal(constants.ZERO_ADDRESS);
        }
      });

      then('event is emitted', async () => {
        await expect(response).to.emit(ERC721Batch, 'TransferBatch').withArgs(owner.address, getAddress(to()), ids);
      });
    });
  }

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

  function batchTransfer({
    from,
    to,
    ids,
    signer,
  }: {
    from: string | SignerWithAddress;
    to: string | SignerWithAddress;
    ids: BigNumber[];
    signer?: SignerWithAddress;
  }): Promise<TransactionResponse> {
    const contract = signer ? ERC721Batch.connect(signer) : ERC721Batch;
    return contract['safeBatchTransferFrom(address,address,uint256[])'](getAddress(from), getAddress(to), ids);
  }

  function getAddress(signer: string | SignerWithAddress) {
    return typeof signer === 'string' ? signer : signer.address;
  }
});
