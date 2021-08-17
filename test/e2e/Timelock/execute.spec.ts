import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { Contract, ContractFactory, PopulatedTransaction } from 'ethers';
import { ethers } from 'hardhat';
import TIMELOCK from '@openzeppelin/contracts/build/contracts/TimelockController.json';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { constants, evm, wallet } from '@test-utils';
import { contract, given, then, when } from '@test-utils/bdd';
import moment from 'moment';
import { expect } from 'chai';
import { hexZeroPad } from 'ethers/lib/utils';
import { deployContract } from 'ethereum-waffle';

contract('Timelock', () => {
  const minDelay = moment.duration('1', 'day').as('seconds');

  let deployer: SignerWithAddress;
  let immediateGovernor: SignerWithAddress;
  let feeRecipient: SignerWithAddress;

  let globalParametersFactory: ContractFactory;

  let globalParameters: Contract;
  let timelock: Contract;

  const nftDescriptor = wallet.generateRandomAddress();
  const oracle = wallet.generateRandomAddress();

  const VALUE = 0;
  const PREDECESSOR = constants.ZERO_BYTES32;

  before(async () => {
    globalParametersFactory = await ethers.getContractFactory('contracts/DCAGlobalParameters/DCAGlobalParameters.sol:DCAGlobalParameters');
  });

  beforeEach(async () => {
    [deployer, immediateGovernor, feeRecipient] = await ethers.getSigners();
    timelock = await deployContract(deployer, TIMELOCK, [minDelay, [immediateGovernor.address], [immediateGovernor.address]]);
    globalParameters = await globalParametersFactory.deploy(
      immediateGovernor.address,
      timelock.address,
      feeRecipient.address,
      nftDescriptor,
      oracle
    );
  });

  describe('execute', () => {
    let populatedTransaction: PopulatedTransaction;
    const SALT = hexZeroPad(wallet.generateRandomAddress(), 32);
    const NEW_ORACLE = wallet.generateRandomAddress();
    given(async () => {
      populatedTransaction = await globalParameters.populateTransaction.setOracle(NEW_ORACLE);
      await timelock
        .connect(immediateGovernor)
        .schedule(globalParameters.address, VALUE, populatedTransaction.data, PREDECESSOR, SALT, minDelay);
    });
    when('executing before delay', () => {
      let executeTx: Promise<TransactionResponse>;
      given(async () => {
        executeTx = timelock.connect(immediateGovernor).execute(globalParameters.address, VALUE, populatedTransaction.data, PREDECESSOR, SALT);
      });
      then('tx is reverted', async () => {
        await expect(executeTx).to.be.revertedWith('TimelockController: operation is not ready');
      });
    });
    when('executing after delay', () => {
      given(async () => {
        await evm.advanceTimeAndBlock(minDelay);
        await timelock.connect(immediateGovernor).execute(globalParameters.address, VALUE, populatedTransaction.data, PREDECESSOR, SALT);
      });
      then('tx is sent', async () => {
        expect(await globalParameters.oracle()).to.be.equal(NEW_ORACLE);
      });
    });
  });
});
