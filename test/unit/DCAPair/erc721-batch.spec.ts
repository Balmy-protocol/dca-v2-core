import { BigNumber, Contract, ContractFactory } from 'ethers';
import { ethers } from 'hardhat';
import { expect } from 'chai';
import { _TypedDataEncoder } from '@ethersproject/hash';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { when, then, given } from '../../utils/bdd';
import { constants, behaviours } from '../../utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';
import { fromRpcSig } from 'ethereumjs-util';

describe('ERC721Batch', () => {
  const NAME = 'name';
  const TOKEN_ID = BigNumber.from(1);

  let owner: SignerWithAddress, approved: SignerWithAddress, to: SignerWithAddress, stranger: SignerWithAddress;
  let ERC721BatchContract: ContractFactory;
  let ERC721Batch: Contract;

  before('Setup accounts and contracts', async () => {
    [owner, approved, to, stranger] = await ethers.getSigners();
    ERC721BatchContract = await ethers.getContractFactory('contracts/mocks/DCAPair/ERC721Batch.sol:ERC721BatchMock');
  });

  beforeEach('Deploy and configure', async () => {
    ERC721Batch = await ERC721BatchContract.deploy(NAME);
    await ERC721Batch.mint(owner.address, TOKEN_ID);
  });

  // If sender is owner, then ok
  // If sender is approved for tokens individually, then ok
  // If sender is approved for all, then ok
  // If one of the tokens isn't owned or approved, then reverts
  // If _checkOnERC721Received fails, then reverts

  // ok would be:
  // * ownership changed
  // * balanceOf increased
  // * event emitted
  // * token approval is zero-address

  describe.only('safeBatchTransferFrom', () => {
    when(`transfer is called by owner`, () => {
      let response: TransactionResponse;

      given(async () => {
        response = await batchTransfer(owner, to, TOKEN_ID);
      });

      then('ownership is changed', async () => {
        expect(await ERC721Batch.ownerOf(TOKEN_ID)).to.be.equal(to.address);
      });

      then('balanceOf is increased', async () => {
        expect(await ERC721Batch.balanceOf(to.address)).to.be.equal(1);
      });

      then(`token's approval is zero-address`, async () => {
        expect(await ERC721Batch.getApproved(TOKEN_ID)).to.be.equal(constants.ZERO_ADDRESS);
      });

      then('event is emitted', async () => {
        await expect(response).to.emit(ERC721Batch, 'TransferBatch').withArgs(owner.address, to.address, [TOKEN_ID]);
      });
    });

    testTxIsReverted({
      when: 'to is zero address',
      from: owner,
      to: constants.ZERO_ADDRESS,
      ids: [TOKEN_ID],
      errorMessage: 'ERC721Batch: transfer to the zero address',
    });

    testTxIsReverted({
      when: 'no ids are sent',
      from: owner,
      to,
      ids: [],
      errorMessage: 'ERC721Batch: you need to transfer at least one token',
    });
  });

  function testTxIsReverted({
    when: title,
    from,
    to,
    ids,
    errorMessage,
  }: {
    when: string;
    from: SignerWithAddress | string;
    to: SignerWithAddress | string;
    ids: BigNumber[];
    errorMessage: string;
  }) {
    when(title, () => {
      let tx: Promise<TransactionResponse>;

      given(() => {
        tx = batchTransfer(from, to, ...ids);
      });

      then('tx reverts with message', async () => {
        await behaviours.checkTxRevertedWithMessage({ tx, message: errorMessage });
      });
    });
  }

  async function batchTransfer(from: string | SignerWithAddress, to: string | SignerWithAddress, ...ids: BigNumber[]) {
    const fromAddress = typeof from === 'string' ? from : from.address;
    const toAddress = typeof to === 'string' ? to : to.address;
    return ERC721Batch.safeBatchTransferFrom(fromAddress, toAddress, ids);
  }
});
