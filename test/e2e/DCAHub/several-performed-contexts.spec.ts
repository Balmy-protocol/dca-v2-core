import moment from 'moment';
import { expect } from 'chai';
import { BigNumber, Contract, utils } from 'ethers';
import { ethers } from 'hardhat';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { DCAHub, DCAHub__factory, TimeWeightedOracleMock, TimeWeightedOracleMock__factory } from '@typechained';
import { constants, erc20, wallet } from '@test-utils';
import { given, then, when, contract } from '@test-utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { TokenContract } from '@test-utils/erc20';
import { readArgFromEventOrFail } from '@test-utils/event-utils';
import { snapshot } from '@test-utils/evm';

contract.only('DCAHub', () => {
  describe('increase position', () => {
    let governor: SignerWithAddress;
    let dude: SignerWithAddress;
    let tokenA: TokenContract, tokenB: TokenContract;
    let DCAHubFactory: DCAHub__factory;
    let DCAHub: DCAHub;
    let timeWeightedOracleFactory: TimeWeightedOracleMock__factory;
    let timeWeightedOracle: TimeWeightedOracleMock;
    let snapshotId: string;

    const SWAP_INTERVAL = moment.duration(10, 'minutes').as('seconds');
    const DUDE_INITIAL_BALANCE = utils.parseEther('1000');

    before('Setup accounts and contracts', async () => {
      [governor, dude] = await ethers.getSigners();
      DCAHubFactory = await ethers.getContractFactory('contracts/DCAHub/DCAHub.sol:DCAHub');
      timeWeightedOracleFactory = await ethers.getContractFactory('contracts/mocks/DCAHub/TimeWeightedOracleMock.sol:TimeWeightedOracleMock');

      const deploy = () => erc20.deploy({ name: 'A name', symbol: 'SYMB' });
      const tokens = [await deploy(), await deploy()];
      [tokenA, tokenB] = tokens.sort((a, b) => a.address.localeCompare(b.address));
      timeWeightedOracle = await timeWeightedOracleFactory.deploy(0, 0);
      DCAHub = await DCAHubFactory.deploy(governor.address, governor.address, timeWeightedOracle.address, constants.NOT_ZERO_ADDRESS);
      await DCAHub.addSwapIntervalsToAllowedList([SWAP_INTERVAL], ['NULL']);
      await tokenA.mint(dude.address, DUDE_INITIAL_BALANCE);
      await tokenA.connect(dude).approve(DCAHub.address, tokenA.asUnits(200));
      // await DCAHub.connect(dude).deposit(tokenA.address, tokenB.address, tokenA.asUnits(200), 1, SWAP_INTERVAL, dude.address, []);
      snapshotId = await snapshot.take();
    });

    beforeEach('Deploy and configure', async () => {
      await snapshot.revert(snapshotId);
    });

    when('no swaps were performed', () => {
      canDeposit();
      canWithdrawSwapped();
      canReducePosition();
      canIncreasePosition();
      canTerminatePosition();
    });

    when('some swaps were performed', () => {
      canDeposit();
      canWithdrawSwapped();
      canReducePosition();
      canIncreasePosition();
      canTerminatePosition();
    });

    when('all swaps were performed', () => {
      canDeposit();
      canWithdrawSwapped();
      canReducePosition();
      canIncreasePosition();
      canTerminatePosition();
    });
  });

  function canDeposit() {
    describe('deposit', () => {
      then('takes funds from depositor');
      then('hub receives funds');
      then('creates position for owner');
    });
  }

  function canWithdrawSwapped() {
    describe('withdrawSwapped', () => {
      then('takes funds from hub');
      then('funds are sent to recipient');
    });
  }

  function canIncreasePosition() {
    describe('increasePosition', () => {
      then('takes funds from sender');
      then('funds are sent to hub');
      then('position gets modified');
    });
  }

  function canReducePosition() {
    describe('reducePosition', () => {
      then('takes funds from hub');
      then('funds are sent to sender');
      then('position gets modified');
    });
  }

  function canTerminatePosition() {
    describe('terminate', () => {
      then('swapped funds are returned to recipient');
      then('unswapped funds are returned to recipient');
      then('position gets deleted');
    });
  }
});
