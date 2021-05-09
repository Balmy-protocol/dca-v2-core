import { BigNumber, Contract, ContractFactory, utils } from 'ethers';
import { ethers } from 'hardhat';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { constants, erc20, wallet } from '../../../utils';
import { given, then, when } from '../../../utils/bdd';
import { expect } from 'chai';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

describe('CollectableDust', function () {
  let owner: SignerWithAddress;
  let someToken: Contract;
  let collectableDustContract: ContractFactory;
  let collectableDust: Contract;

  before('Setup accounts and contracts', async () => {
    [owner] = await ethers.getSigners();
    collectableDustContract = await ethers.getContractFactory('contracts/mocks/DCAPair/utils/CollectableDust.sol:CollectableDustMock');
  });

  beforeEach('Deploy and configure', async () => {
    collectableDust = await collectableDustContract.deploy();
    someToken = await erc20.deploy({
      initialAccount: owner.address,
      initialAmount: utils.parseEther('100000'),
      name: 'Some Token',
      symbol: 'ST',
    });
  });

  describe('addProtocolToken', () => {
    when('adding token that is not part of the protocol', () => {
      given(async () => {
        await collectableDust.addProtocolToken(someToken.address);
      });
      then('adds token', async () => {
        expect(await collectableDust.containsProtocolToken(someToken.address)).to.be.true;
      });
    });
    when('adding token that is part of the protocol', () => {
      let addProtocolTokenTx: Promise<TransactionResponse>;
      given(async () => {
        await collectableDust.addProtocolToken(someToken.address);
        addProtocolTokenTx = collectableDust.addProtocolToken(someToken.address);
      });
      then('tx is reverted with reason', async () => {
        await expect(addProtocolTokenTx).to.be.revertedWith('CollectableDust: token already part of protocol');
      });
    });
  });

  describe('removeProtocolToken', () => {
    when('removing token that is not part of the protocol', () => {
      let removeProtocolTokenTx: Promise<TransactionResponse>;
      given(async () => {
        removeProtocolTokenTx = collectableDust.removeProtocolToken(someToken.address);
      });
      then('tx is reverted with reason', async () => {
        await expect(removeProtocolTokenTx).to.be.revertedWith('CollectableDust: token is not part of protocol');
      });
    });
    when('removing token that is part of the protocol', () => {
      let removeProtocolTokenTx: TransactionResponse;
      given(async () => {
        await collectableDust.addProtocolToken(someToken.address);
        removeProtocolTokenTx = await collectableDust.removeProtocolToken(someToken.address);
      });
      then('removes token', async () => {
        expect(await collectableDust.containsProtocolToken(someToken.address)).to.be.false;
      });
    });
  });

  describe('sendDust', () => {
    when('sending dust to zero', () => {
      let sendDustTx: Promise<TransactionResponse>;
      given(async () => {
        sendDustTx = collectableDust.sendDust(constants.ZERO_ADDRESS, someToken.address, utils.parseEther('1'));
      });
      then('tx is reverted with reason', async () => {
        await expect(sendDustTx).to.be.revertedWith('CollectableDust: zero address');
      });
    });
    when('token is part of the protocol', () => {
      let sendDustTx: Promise<TransactionResponse>;
      beforeEach(async () => {
        await collectableDust.addProtocolToken(someToken.address);
        sendDustTx = collectableDust.sendDust(await wallet.generateRandomAddress(), someToken.address, utils.parseEther('1'));
      });
      then('tx is reverted with reason', async () => {
        await expect(sendDustTx).to.be.revertedWith('CollectableDust: token is part of protocol');
      });
    });
    when('not sending dust to zero and collecting eth dust', () => {
      let sendDustTx: TransactionResponse;
      let collectorAddress: string;
      const initialDustBalanceOfContract = utils.parseEther('1');
      const collectedDust = initialDustBalanceOfContract.div(2);
      given(async () => {
        collectorAddress = await wallet.generateRandomAddress();
        await collectableDust.addProtocolToken(someToken.address);
        const forceETHContract = await ethers.getContractFactory('contracts/mocks/ForceETH.sol:ForceETH');
        await forceETHContract.deploy(collectableDust.address, { value: initialDustBalanceOfContract });
        sendDustTx = await collectableDust.sendDust(collectorAddress, await collectableDust.ETH(), collectedDust);
      });
      then('eth is collected from contract', async () => {
        expect(await ethers.provider.getBalance(collectableDust.address)).to.equal(initialDustBalanceOfContract.sub(collectedDust));
      });
      then('eth is sent to collector', async () => {
        expect(await ethers.provider.getBalance(collectorAddress)).to.equal(collectedDust);
      });
      then('event is emitted with arguments', async () => {
        await expect(sendDustTx)
          .to.emit(collectableDust, 'DustSent')
          .withArgs(collectorAddress, await collectableDust.ETH(), collectedDust);
      });
    });
    context('not sending dust to zero and collecting erc20 dust', () => {
      let someOtherToken: Contract;
      let sendDustTx: TransactionResponse;
      let collectorAddress: string;
      const initialDustBalanceOfContract = utils.parseEther('1');
      const collectedDust = initialDustBalanceOfContract.div(2);
      given(async () => {
        collectorAddress = await wallet.generateRandomAddress();
        await collectableDust.addProtocolToken(someToken.address);
        someOtherToken = await erc20.deploy({
          initialAccount: owner.address,
          initialAmount: utils.parseEther('100000'),
          name: 'Some Other Token',
          symbol: 'SOT',
        });
        await someOtherToken.transfer(collectableDust.address, initialDustBalanceOfContract);
        sendDustTx = await collectableDust.sendDust(collectorAddress, someOtherToken.address, collectedDust);
      });
      then('eth is collected from contract', async () => {
        expect(await someOtherToken.balanceOf(collectableDust.address)).to.equal(initialDustBalanceOfContract.sub(collectedDust));
      });
      then('eth is sent to collector', async () => {
        expect(await someOtherToken.balanceOf(collectorAddress)).to.equal(collectedDust);
      });
      then('event is emitted with arguments', async () => {
        await expect(sendDustTx).to.emit(collectableDust, 'DustSent').withArgs(collectorAddress, someOtherToken.address, collectedDust);
      });
    });
  });
});
