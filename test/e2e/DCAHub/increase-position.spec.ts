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
    let TimeWeightedOracleFactory: TimeWeightedOracleMock__factory;
    let TimeWeightedOracle: TimeWeightedOracleMock;
    let snapshotId: string;

    const SWAP_INTERVAL = moment.duration(10, 'minutes').as('seconds');
    const DUDE_INITIAL_BALANCE = utils.parseEther('1000');

    before('Setup accounts and contracts', async () => {
      [governor, dude] = await ethers.getSigners();
      DCAHubFactory = await ethers.getContractFactory('contracts/DCAHub/DCAHub.sol:DCAHub');
      TimeWeightedOracleFactory = await ethers.getContractFactory('contracts/mocks/DCAHub/TimeWeightedOracleMock.sol:TimeWeightedOracleMock');

      const deploy = () => erc20.deploy({ name: 'A name', symbol: 'SYMB' });
      const tokens = [await deploy(), await deploy()];
      [tokenA, tokenB] = tokens.sort((a, b) => a.address.localeCompare(b.address));
      TimeWeightedOracle = await TimeWeightedOracleFactory.deploy(0, 0);
      DCAHub = await DCAHubFactory.deploy(
        tokenA.address,
        tokenB.address,
        governor.address,
        constants.NOT_ZERO_ADDRESS,
        constants.NOT_ZERO_ADDRESS,
        TimeWeightedOracle.address
      );
      await DCAHub.addSwapIntervalsToAllowedList([SWAP_INTERVAL], ['NULL']);
      await tokenA.mint(dude.address, DUDE_INITIAL_BALANCE);
      await tokenA.connect(dude).approve(DCAHub.address, tokenA.asUnits(200));
      await DCAHub.connect(dude).deposit(dude.address, tokenA.address, tokenA.asUnits(200), 1, SWAP_INTERVAL);
      snapshotId = await snapshot.take();
    });

    beforeEach('Deploy and configure', async () => {
      await snapshot.revert(snapshotId);
    });

    when('no swaps were performed', () => {
      then('position gets increased');
      when('swaps everything', () => {
        then('positions is withdrawable');
      });
    });

    when('some swaps were performed', () => {
      then('position gets increased');
      when('swaps everything', () => {
        then('positions is withdrawable');
      });
    });

    when('all swaps were performed', () => {
      then('position gets increased');
      when('swaps everything', () => {
        then('positions is withdrawable');
      });
    });
  });
});
