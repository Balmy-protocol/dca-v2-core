import { expect } from 'chai';
import { BigNumber, utils } from 'ethers';
import { ethers } from 'hardhat';
import {
  DCAHub,
  DCAHub__factory,
  DCAHubSwapCalleeMock,
  DCAHubSwapCalleeMock__factory,
  DCAPermissionsManager,
  DCAPermissionsManager__factory,
  IPriceOracle,
} from '@typechained';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { constants, erc20, evm } from '@test-utils';
import { contract, given, then, when } from '@test-utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { TokenContract } from '@test-utils/erc20';
import { SwapInterval } from 'js-lib/interval-utils';
import { FakeContract, smock } from '@defi-wonderland/smock';

contract('DCAPermissionManager', () => {
  let governor: SignerWithAddress, user: SignerWithAddress;
  let tokenA: TokenContract, tokenB: TokenContract;
  let DCAHubFactory: DCAHub__factory, DCAHub: DCAHub;
  let priceOracle: FakeContract<IPriceOracle>;
  let DCAHubSwapCalleeFactory: DCAHubSwapCalleeMock__factory, DCAHubSwapCallee: DCAHubSwapCalleeMock;
  let DCAPermissionsManagerFactory: DCAPermissionsManager__factory, DCAPermissionsManager: DCAPermissionsManager;

  before('Setup accounts and contracts', async () => {
    [governor, user] = await ethers.getSigners();
    DCAHubFactory = await ethers.getContractFactory('contracts/DCAHub/DCAHub.sol:DCAHub');
    DCAHubSwapCalleeFactory = await ethers.getContractFactory('contracts/mocks/DCAHubSwapCallee.sol:DCAHubSwapCalleeMock');
    DCAPermissionsManagerFactory = await ethers.getContractFactory(
      'contracts/DCAPermissionsManager/DCAPermissionsManager.sol:DCAPermissionsManager'
    );
  });

  beforeEach('Deploy and configure', async () => {
    tokenA = await erc20.deploy({
      name: 'tokenA',
      symbol: 'TKNA',
      decimals: 12,
      initialAccount: user.address,
      initialAmount: utils.parseUnits('1000', 12),
    });
    tokenB = await erc20.deploy({
      name: 'tokenB',
      symbol: 'TKNB',
      decimals: 16,
    });

    priceOracle = await smock.fake('IPriceOracle');
    DCAPermissionsManager = await DCAPermissionsManagerFactory.deploy(constants.NOT_ZERO_ADDRESS, constants.NOT_ZERO_ADDRESS);

    DCAHub = await DCAHubFactory.deploy(governor.address, governor.address, priceOracle.address, DCAPermissionsManager.address);
    await DCAPermissionsManager.setHub(DCAHub.address);
    await DCAHub.addSwapIntervalsToAllowedList([SwapInterval.FIFTEEN_MINUTES.seconds, SwapInterval.ONE_HOUR.seconds]);
  });

  when('no position was created', () => {
    then('totalSupply is zero', async () => {
      expect(await DCAPermissionsManager.totalSupply()).to.equal(0);
    });
    when('only one position was created', () => {
      given(async () => {
        await deposit();
      });
      then('total supply is 1', async () => {
        expect(await DCAPermissionsManager.totalSupply()).to.equal(1);
      });
    });
    when('two positions were created', () => {
      given(async () => {
        await deposit();
        await deposit();
      });
      then('total supply is 2', async () => {
        expect(await DCAPermissionsManager.totalSupply()).to.equal(2);
      });
      context('and one gets terminated', () => {
        given(async () => {
          await terminate(1);
        });
        then('total supply is 1', async () => {
          expect(await DCAPermissionsManager.totalSupply()).to.equal(1);
        });
      });
    });
  });

  async function deposit() {
    const TOTAL_AMOUNT = utils.parseUnits('10', 12);
    await tokenA.connect(user).approve(DCAHub.address, TOTAL_AMOUNT);
    await DCAHub.connect(user)['deposit(address,address,uint256,uint32,uint32,address,(address,uint8[])[])'](
      tokenA.address,
      tokenB.address,
      TOTAL_AMOUNT,
      5,
      SwapInterval.FIFTEEN_MINUTES.seconds,
      user.address,
      []
    );
  }
  async function terminate(positionId: number) {
    await DCAHub.connect(user).terminate(positionId, user.address, user.address);
  }
});
