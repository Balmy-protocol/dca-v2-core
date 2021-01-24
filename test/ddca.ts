import { expect } from 'chai';
import { Contract, ContractFactory, Signer, utils } from 'ethers';
import { ethers } from 'hardhat';
import { uniswap, erc20 } from './utils';

describe('DDCA', function() {
  let owner: Signer, alice: Signer, maintainer: Signer;
  let fromToken: Contract, fromTokenFromAlice: Contract;
  let DDCAContract: ContractFactory, ddca: Contract, ddcaFromAlice: Contract;

  before('Setup accounts and contracts', async () => {
    [owner, alice, maintainer] = await ethers.getSigners();
    DDCAContract = await ethers.getContractFactory('contracts/DDCA.sol:DDCA');
  });

  beforeEach('Deploy and configure', async () => {
    await uniswap.deploy({
      owner
    });
    fromToken = await erc20.deploy({
      name: 'DAI',
      symbol: 'DAI',
      initialAccount: await owner.getAddress(),
      initialAmount: utils.parseEther('10000000000000')
    });
    fromTokenFromAlice = await fromToken.connect(alice);
    await uniswap.createPair(fromToken);
    await uniswap.addLiquidityETH({
      owner,
      tokenA: fromToken
    });
    ddca = await DDCAContract.deploy(
      fromToken.address,
      uniswap.getWETH().address,
      uniswap.getUniswapV2Router02().address
    );
    ddcaFromAlice = await ddca.connect(alice);
  });

  describe('deposit', () => {
    context('when user does not own those tokens', () => {
      it('reverts with message');
    });
    context('when user owns those tokens', () => {
      beforeEach(async () => {
        await fromToken.approve(ddca.address, utils.parseEther('10'));
      });
      it('takes tokens from user');
      it('modifies tickets diff accordingly', async () => {
        await ddca.deposit(
          1,
          10,
          utils.parseEther('1')
        );
        console.log('tickets diff start date', (await ddca.amountDiff(1)).toString());
        console.log('tickets diff end date', (await ddca.amountDiff(10)).toString());
      });
      it('adds trade to user trades');
      it('emits event');
    });
  });



  describe('meme test', () => {
    it('console log', async () => {
      await fromToken.approve(ddca.address, utils.parseEther('2000'));
      await fromToken.transfer(await alice.getAddress(), utils.parseEther('200'))
      await fromTokenFromAlice.approve(ddca.address, utils.parseEther('200'));
      await ddca.deposit(
        1,
        11,
        utils.parseEther('200')
      );
      await ddcaFromAlice.deposit(
        0,
        10,
        utils.parseEther('20')
      );
      for (let i = 0; i < 11; i ++) {
        console.log('set today', i);
        await ddca.setToday(i);
        await ddca.buy();
        console.log('owner eth swapped', utils.formatEther(await ddca.swapped()), (await ddca.swapped()).toString());
        console.log('alice eth swapped', utils.formatEther(await ddcaFromAlice.swapped()));
      }
    });
  });
});
