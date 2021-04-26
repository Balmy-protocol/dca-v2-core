import { expect } from 'chai';
import { BigNumber, Contract, ContractFactory, Signer, utils } from 'ethers';
import { ethers, network } from 'hardhat';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { JsonRpcSigner } from '@ethersproject/providers';
import { constants, erc20, behaviours, evm } from '../../utils';
import { given, then, when } from '../../utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

const forkBlockNumber = 12313262; // will allow to cache blockchain state
const KEEP3R_V1 = '0x1cEB5cB57C4D4E2b2433641b95Dd330A33185A44';
const keep3rGovernanceAddress = '0x0d5dc686d0a2abbfdafdfb4d0533e886517d4e83';

describe.only('Keep3rJob', () => {
  let keep3rV1: Contract;
  let keep3rJobContract: ContractFactory;
  let keep3rJob: Contract;
  let keep3rGovernance: JsonRpcSigner;
  let keeper: SignerWithAddress;
  const INITIAL_JOB_KP3RS = utils.parseEther('50');

  before('Setup accounts and contracts', async () => {
    [keeper] = await ethers.getSigners();
    keep3rV1 = await ethers.getContractAt('contracts/interfaces/Keep3r/IKeep3rV1.sol:IKeep3rV1', KEEP3R_V1);
    keep3rJobContract = await ethers.getContractFactory('contracts/mocks/Keep3r/Keep3rJob.sol:Keep3rJobMock');
  });

  beforeEach('Deploy and configure', async () => {
    await evm.reset({
      jsonRpcUrl: process.env.MAINNET_HTTPS_URL,
      blockNumber: forkBlockNumber,
    });
    keep3rJob = await keep3rJobContract.deploy(KEEP3R_V1);
    await network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [keep3rGovernanceAddress],
    });
    keep3rGovernance = ethers.provider.getSigner(keep3rGovernanceAddress);
    await keep3rV1.connect(keep3rGovernance).addJob(keep3rJob.address, { gasPrice: 0 });
    await keep3rV1.connect(keep3rGovernance).addKPRCredit(keep3rJob.address, INITIAL_JOB_KP3RS, { gasPrice: 0 });
  });

  describe('constructor', () => {
    when('keep3rV1 is zero address', () => {
      then('tx is reverted with reason', async () => {
        await behaviours.deployShouldRevertWithZeroAddress({
          contract: keep3rJobContract,
          args: [constants.ZERO_ADDRESS],
        });
      });
    });
    when('all data is valid', () => {
      let keep3rJobConstructorTest: Contract;
      given(async () => {
        keep3rJobConstructorTest = await keep3rJobContract.deploy(constants.NOT_ZERO_ADDRESS);
      });
      then('sets keep3rV1 and emits event', async () => {
        await behaviours.txShouldSetVariableAndEmitEvent({
          contract: keep3rJobConstructorTest,
          getterFunc: 'keep3rV1',
          setterFunc: 'setKeep3rV1',
          variable: KEEP3R_V1,
          eventEmitted: 'Keep3rV1Set',
        });
      });
    });
  });

  describe('setKeep3rV1', () => {
    when('keep3rV1 is zero address', () => {
      then('tx is reverted with reason', async () => {
        await behaviours.txShouldRevertWithZeroAddress({
          contract: keep3rJob,
          func: 'setKeep3rV1',
          args: [constants.ZERO_ADDRESS],
        });
      });
    });
    when('keep3rV1 is valid', () => {
      let setKeep3rTx: TransactionResponse;
      given(async () => {
        setKeep3rTx = await keep3rJob.setKeep3rV1(keep3rV1.address);
      });
      then('sets keep3rV1', async () => {
        expect(await keep3rJob.keep3rV1()).to.equal(keep3rV1.address);
      });
      then('emits event with correct information', async () => {
        await expect(setKeep3rTx).to.emit(keep3rJob, 'Keep3rV1Set').withArgs(keep3rV1.address);
      });
    });
  });

  describe('paysKp3rInBondedTokens', () => {
    when('executed', () => {
      const gasToSpend = utils.parseEther('1');
      const gasPrice = utils.parseUnits('5000', 'gwei');
      let initialKp3rBonded: BigNumber;
      let spendGasTx: TransactionResponse;
      given(async () => {
        initialKp3rBonded = await keep3rV1.bonds(keeper.address, keep3rV1.address);
        spendGasTx = await keep3rJob.spendGas(gasToSpend, gasPrice, { gasPrice });
      });
      then('keeper gets gas used paid in bonded kp3r tokens', async () => {
        expect(await keep3rV1.bonds(keeper.address, keep3rV1.address)).to.be.gt(initialKp3rBonded);
      });
      then('kp3r credit from job gets reduced', async () => {
        expect(await keep3rV1.credits(keep3rJob.address, keep3rV1.address)).to.equal(
          INITIAL_JOB_KP3RS.sub(await keep3rV1.bonds(keeper.address, keep3rV1.address))
        );
      });
    });
  });
  describe('paysKeeperAmount', () => {
    when('executed', () => {
      then('keeper gets amount paid in bonded kp3r tokens');
      then('kp3r credit from job gets reduced');
    });
  });
  describe('paysKeeperCredit', () => {
    then('keeper gets amount paid in bonded erc20 tokens');
    then('erc20 credit from job gets reduced');
  });
  describe('paysKeeperEth', () => {
    then('keeper gets ETH amount paid');
    then('ETH credit from job gets reduced');
  });
});
