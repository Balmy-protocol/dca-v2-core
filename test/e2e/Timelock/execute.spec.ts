import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { Contract, PopulatedTransaction } from 'ethers';
import { ethers } from 'hardhat';
import TIMELOCK from '@openzeppelin/contracts/build/contracts/TimelockController.json';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { constants, erc20, evm, wallet } from '@test-utils';
import { contract, given, then, when } from '@test-utils/bdd';
import { DCAHub__factory, DCAHub } from '@typechained';
import moment from 'moment';
import { expect } from 'chai';
import { hexZeroPad } from 'ethers/lib/utils';
import { deployContract } from 'ethereum-waffle';
import { snapshot } from '@test-utils/evm';

contract('Timelock', () => {
  const minDelay = moment.duration('1', 'day').as('seconds');

  let deployer: SignerWithAddress;
  let immediateGovernor: SignerWithAddress;

  let DCAHubFactory: DCAHub__factory;
  let DCAHub: DCAHub;
  let timelock: Contract;

  let snapshotId: string;

  const oracle = wallet.generateRandomAddress();

  const VALUE = 0;
  const PREDECESSOR = constants.ZERO_BYTES32;

  before(async () => {
    [deployer, immediateGovernor] = await ethers.getSigners();
    DCAHubFactory = await ethers.getContractFactory('contracts/DCAHub/DCAHub.sol:DCAHub');
    timelock = await deployContract(deployer, TIMELOCK, [minDelay, [immediateGovernor.address], [immediateGovernor.address]]);
    const tokenA = await erc20.deploy({
      name: 'WBTC',
      symbol: 'WBTC',
      decimals: 8,
    });
    const tokenB = await erc20.deploy({
      name: 'DAI',
      symbol: 'DAI',
      decimals: 18,
    });
    DCAHub = await DCAHubFactory.deploy(immediateGovernor.address, timelock.address, oracle, constants.NOT_ZERO_ADDRESS);
    snapshotId = await snapshot.take();
  });

  beforeEach(async () => {
    await snapshot.revert(snapshotId);
  });

  describe('execute', () => {
    let populatedTransaction: PopulatedTransaction;
    const SALT = hexZeroPad(wallet.generateRandomAddress(), 32);
    const NEW_ORACLE = wallet.generateRandomAddress();
    given(async () => {
      populatedTransaction = await DCAHub.populateTransaction.setOracle(NEW_ORACLE);
      await timelock.connect(immediateGovernor).schedule(DCAHub.address, VALUE, populatedTransaction.data, PREDECESSOR, SALT, minDelay);
    });
    when('executing before delay', () => {
      let executeTx: Promise<TransactionResponse>;
      given(async () => {
        executeTx = timelock.connect(immediateGovernor).execute(DCAHub.address, VALUE, populatedTransaction.data, PREDECESSOR, SALT);
      });
      then('tx is reverted', async () => {
        await expect(executeTx).to.be.revertedWith('TimelockController: operation is not ready');
      });
    });
    when('executing after delay', () => {
      given(async () => {
        await evm.advanceTimeAndBlock(minDelay);
        await timelock.connect(immediateGovernor).execute(DCAHub.address, VALUE, populatedTransaction.data, PREDECESSOR, SALT);
      });
      then('tx is sent', async () => {
        expect(await DCAHub.oracle()).to.be.equal(NEW_ORACLE);
      });
    });
  });
});
