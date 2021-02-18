import { expect } from 'chai';
import { Contract, ContractFactory, Signer, utils } from 'ethers';
import { ethers } from 'hardhat';
import { constants, uniswap, erc20, behaviours } from '../../utils';

describe('DCAFactoryPairsHandler', function () {
  let owner: Signer, feeRecipient: Signer;
  let fromToken: Contract;
  let DCAFactoryPairsHandlerContract: ContractFactory;
  let DCAFactoryPairsHandler: Contract;

  before('Setup accounts and contracts', async () => {
    [owner, feeRecipient] = await ethers.getSigners();
    DCAFactoryPairsHandlerContract = await ethers.getContractFactory(
      'contracts/mocks/DCAFactory/DCAFactoryPairsHandler.sol:DCAFactoryPairsHandlerMock'
    );
  });

  beforeEach('Deploy and configure', async () => {
    await uniswap.deploy({
      owner,
    });
    fromToken = await erc20.deploy({
      name: 'DAI',
      symbol: 'DAI',
      initialAccount: await owner.getAddress(),
      initialAmount: utils.parseEther('1'),
    });
    DCAFactoryPairsHandler = await DCAFactoryPairsHandlerContract.deploy(
      await feeRecipient.getAddress(),
      uniswap.getUniswapV2Router02().address
    );
  });

  describe('createPair', () => {
    const allowedIntervals = [1000];
    beforeEach(async () => {
      await DCAFactoryPairsHandler.addSwapIntervalsToAllowedList(
        allowedIntervals
      );
    });
    context('when swap interval is not allowed', () => {
      it('reverts with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAFactoryPairsHandler,
          func: 'createPair',
          args: [fromToken.address, uniswap.getWETH().address, 1],
          message: 'DCAFactory: interval-not-allowed',
        });
      });
    });
    context('when from is zero address', () => {
      it('reverts with message', async () => {
        await behaviours.txShouldRevertWithZeroAddress({
          contract: DCAFactoryPairsHandler,
          func: 'createPair',
          args: [
            constants.ZERO_ADDRESS,
            uniswap.getWETH().address,
            allowedIntervals[0],
          ],
        });
      });
    });
    context('when to is zero address', () => {
      it('reverts with message', async () => {
        await behaviours.txShouldRevertWithZeroAddress({
          contract: DCAFactoryPairsHandler,
          func: 'createPair',
          args: [
            fromToken.address,
            constants.ZERO_ADDRESS,
            allowedIntervals[0],
          ],
        });
      });
    });
    context('when pair already exists', () => {
      beforeEach(async () => {
        await DCAFactoryPairsHandler.createPair(
          fromToken.address,
          uniswap.getWETH().address,
          allowedIntervals[0]
        );
      });
      it('reverts with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAFactoryPairsHandler,
          func: 'createPair',
          args: [
            fromToken.address,
            uniswap.getWETH().address,
            allowedIntervals[0],
          ],
          message: 'DCAFactory: pair-exists',
        });
      });
    });
    context(
      'when swap interval is allowed, no token is zero address and pair does not exist',
      () => {
        it('creates pair with correct information, adds it to registry and emits event', async () => {
          expect(
            await DCAFactoryPairsHandler.pairByTokensAndSwapInterval(
              fromToken.address,
              uniswap.getWETH().address,
              allowedIntervals[0]
            )
          ).to.equal(constants.ZERO_ADDRESS);
          const pairAddress = await DCAFactoryPairsHandler.callStatic.createPair(
            fromToken.address,
            uniswap.getWETH().address,
            allowedIntervals[0]
          );
          await expect(
            DCAFactoryPairsHandler.createPair(
              fromToken.address,
              uniswap.getWETH().address,
              allowedIntervals[0]
            )
          )
            .to.emit(DCAFactoryPairsHandler, 'PairCreated')
            .withArgs(
              fromToken.address,
              uniswap.getWETH().address,
              allowedIntervals[0],
              pairAddress
            );
          const dcaPair = await ethers.getContractAt(
            'contracts/DCAPair/DCAPair.sol:DCAPair',
            pairAddress
          );
          expect(await dcaPair.factory()).to.equal(
            DCAFactoryPairsHandler.address
          );
          expect(
            await DCAFactoryPairsHandler.pairByTokensAndSwapInterval(
              fromToken.address,
              uniswap.getWETH().address,
              allowedIntervals[0]
            )
          ).to.equal(pairAddress);
          expect(
            await DCAFactoryPairsHandler.pairsByTokens(
              fromToken.address,
              uniswap.getWETH().address,
              0
            )
          ).to.equal(pairAddress);
          expect(
            await DCAFactoryPairsHandler.getPairsByTokens(
              fromToken.address,
              uniswap.getWETH().address
            )
          ).to.eql([pairAddress]);
          expect(await DCAFactoryPairsHandler.allPairs(0)).to.equal(
            pairAddress
          );
        });
      }
    );
  });
});
