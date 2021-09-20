import moment from 'moment';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';
import { constants, erc20, evm, wallet } from '@test-utils';
import { contract } from '@test-utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { TokenContract } from '@test-utils/erc20';
import { readArgFromEventOrFail } from '@test-utils/event-utils';
import {
  DCAHub,
  DCAHub__factory,
  DCAPermissionsManager,
  DCAPermissionsManager__factory,
  DCATokenDescriptor,
  DCATokenDescriptor__factory,
  TimeWeightedOracleMock,
  TimeWeightedOracleMock__factory,
} from '@typechained';
import isSvg from 'is-svg';
import { expect } from 'chai';
import { buildSwapInput } from 'js-lib/swap-utils';

contract('DCATokenDescriptor', () => {
  let governor: SignerWithAddress;
  let tokenA: TokenContract, tokenB: TokenContract;
  let DCAHubContract: DCAHub__factory;
  let DCAHub: DCAHub;
  let DCATokenDescriptorFactory: DCATokenDescriptor__factory;
  let DCATokenDescriptor: DCATokenDescriptor;
  let DCAPermissionsManagerFactory: DCAPermissionsManager__factory;
  let DCAPermissionsManager: DCAPermissionsManager;
  let TimeWeightedOracleFactory: TimeWeightedOracleMock__factory;
  let TimeWeightedOracle: TimeWeightedOracleMock;
  const swapInterval = moment.duration(10, 'minutes').as('seconds');

  before('Setup accounts and contracts', async () => {
    [governor] = await ethers.getSigners();
    DCAHubContract = await ethers.getContractFactory('contracts/DCAHub/DCAHub.sol:DCAHub');
    DCATokenDescriptorFactory = await ethers.getContractFactory('contracts/DCATokenDescriptor/DCATokenDescriptor.sol:DCATokenDescriptor');
    DCAPermissionsManagerFactory = await ethers.getContractFactory(
      'contracts/DCAPermissionsManager/DCAPermissionsManager.sol:DCAPermissionsManager'
    );
    TimeWeightedOracleFactory = await ethers.getContractFactory('contracts/mocks/DCAHub/TimeWeightedOracleMock.sol:TimeWeightedOracleMock');
  });

  beforeEach('Deploy and configure', async () => {
    await evm.reset();
    tokenA = await erc20.deploy({
      name: 'tokenA',
      symbol: 'TKNA',
    });
    tokenB = await erc20.deploy({
      name: 'tokenB',
      symbol: 'TKNB',
    });
    TimeWeightedOracle = await TimeWeightedOracleFactory.deploy(tokenA.asUnits(1), tokenA.amountOfDecimals); // Rate is 1 token A = 1 token B
    DCATokenDescriptor = await DCATokenDescriptorFactory.deploy();
    DCAHub = await DCAHubContract.deploy(
      tokenA.address,
      tokenB.address,
      governor.address,
      constants.NOT_ZERO_ADDRESS,
      TimeWeightedOracle.address
    );
    DCAPermissionsManager = await DCAPermissionsManagerFactory.deploy(governor.address, DCATokenDescriptor.address);
    await DCAPermissionsManager.setHub(DCAHub.address);
    await DCAHub.addSwapIntervalsToAllowedList([swapInterval], ['Daily']);

    await tokenA.mint(governor.address, tokenA.asUnits(1000));
    await tokenB.approveInternal(governor.address, DCAHub.address, tokenB.asUnits(1000));
    await tokenB.mint(governor.address, tokenB.asUnits(1000));
  });

  // TODO: Remove skip when the hub mints NFT on position creation. This won't work until that happens
  it.skip('Validate tokenURI result', async () => {
    // Deposit
    const response = await DCAHub.deposit(governor.address, tokenB.address, tokenB.asUnits(10), 2, swapInterval);
    const tokenId = await readArgFromEventOrFail<BigNumber>(response, 'Deposited', 'dcaId');

    // Execute one swap
    await swap();

    // Get token uri
    const result1 = await DCAPermissionsManager.tokenURI(tokenId);
    const { name: name1, description: description1, image: image1 } = extractJSONFromURI(result1);

    expect(name1).to.equal('Mean Finance DCA - Daily - TKNB ➔ TKNA');
    expect(description1).to.equal(
      `This NFT represents a DCA position in Mean Finance, where TKNB will be swapped for TKNA. The owner of this NFT can modify or redeem the position.\n\nTKNB Address: ${tokenB.address.toLowerCase()}\nTKNA Address: ${tokenA.address.toLowerCase()}\nSwap interval: Daily\nToken ID: 1\n\n⚠️ DISCLAIMER: Due diligence is imperative when assessing this NFT. Make sure token addresses match the expected tokens, as token symbols may be imitated.`
    );
    expect(isValidSvgImage(image1)).to.be.true;

    // Execute the last swap and withdraw
    await evm.advanceTimeAndBlock(swapInterval);
    await swap();
    await DCAHub.withdrawSwapped(tokenId, wallet.generateRandomAddress());

    // Get token uri
    const result2 = await DCAPermissionsManager.tokenURI(tokenId);
    const { name: name2, description: description2, image: image2 } = extractJSONFromURI(result2);

    expect(name2).to.equal(name1);
    expect(description2).to.equal(description1);
    expect(isValidSvgImage(image2)).to.be.true;
  });

  async function swap() {
    await tokenA.transfer(DCAHub.address, tokenA.asUnits(20));
    const { tokens, pairIndexes } = buildSwapInput([{ tokenA: tokenA.address, tokenB: tokenB.address }], []);
    // @ts-ignore
    await DCAHub['swap(address[],(uint8,uint8)[])'](tokens, pairIndexes);
  }

  function isValidSvgImage(base64: string) {
    const encodedImage = base64.substr('data:image/svg+xml;base64,'.length);
    const decodedImage = Buffer.from(encodedImage, 'base64').toString('utf8');
    return isSvg(decodedImage);
  }

  function extractJSONFromURI(uri: string): { name: string; description: string; image: string } {
    const encodedJSON = uri.substr('data:application/json;base64,'.length);
    const decodedJSON = Buffer.from(encodedJSON, 'base64').toString('utf8');
    return JSON.parse(decodedJSON);
  }
});
