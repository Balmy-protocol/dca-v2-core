import moment from 'moment';
import { BigNumber, Contract, ContractFactory } from 'ethers';
import { ethers } from 'hardhat';
import { erc20, evm } from '../../utils';
import { contract } from '../../utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { TokenContract } from '../../utils/erc20';
import { readArgFromEventOrFail } from '../../utils/event-utils';
import isSvg from 'is-svg';
import { expect } from 'chai';

contract('DCATokenDescriptor', () => {
  let governor: SignerWithAddress;
  let feeRecipient: SignerWithAddress;
  let tokenA: TokenContract, tokenB: TokenContract;
  let DCAPairContract: ContractFactory;
  let DCAPair: Contract;
  let DCAGlobalParametersContract: ContractFactory;
  let DCAGlobalParameters: Contract;
  let DCATokenDescriptorContract: ContractFactory;
  let DCATokenDescriptor: Contract;
  let TimeWeightedOracleFactory: ContractFactory;
  let TimeWeightedOracle: Contract;
  const swapInterval = moment.duration(10, 'minutes').as('seconds');

  before('Setup accounts and contracts', async () => {
    [governor, feeRecipient] = await ethers.getSigners();
    DCAGlobalParametersContract = await ethers.getContractFactory('contracts/DCAGlobalParameters/DCAGlobalParameters.sol:DCAGlobalParameters');
    DCAPairContract = await ethers.getContractFactory('contracts/DCAPair/DCAPair.sol:DCAPair');
    DCATokenDescriptorContract = await ethers.getContractFactory('contracts/DCATokenDescriptor/DCATokenDescriptor.sol:DCATokenDescriptor');
    TimeWeightedOracleFactory = await ethers.getContractFactory('contracts/mocks/DCAPair/TimeWeightedOracleMock.sol:TimeWeightedOracleMock');
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
    DCATokenDescriptor = await DCATokenDescriptorContract.deploy();
    DCAGlobalParameters = await DCAGlobalParametersContract.deploy(
      governor.address,
      feeRecipient.address,
      DCATokenDescriptor.address,
      TimeWeightedOracle.address
    );
    DCAPair = await DCAPairContract.deploy(DCAGlobalParameters.address, tokenA.address, tokenB.address);
    await DCAGlobalParameters.addSwapIntervalsToAllowedList([swapInterval], ['Daily']);

    await tokenA.mint(governor.address, tokenA.asUnits(1000));
    await tokenA.approveInternal(governor.address, DCAPair.address, tokenA.asUnits(1000));
    await tokenB.mint(governor.address, tokenB.asUnits(1000));
  });

  it('Validate tokenURI result', async () => {
    // Deposit
    const response = await DCAPair.deposit(tokenA.address, tokenA.asUnits(10), 20, swapInterval);
    const tokenId = await readArgFromEventOrFail<BigNumber>(response, 'Deposited', '_dcaId');

    // Execute one swap
    await tokenB.transfer(DCAPair.address, tokenB.asUnits(20));
    await DCAPair['swap()']();

    // Get token uri
    const result = await DCAPair.tokenURI(tokenId);
    const { name, description, image } = extractJSONFromURI(result);

    expect(name).to.equal('Mean Finance DCA - Daily - TKNA/TKNB');
    expect(description).to.equal(
      `This NFT represents a position in a Mean Finance DCA TKNA-TKNB pair. The owner of this NFT can modify or redeem the position.\n\nPair Address: ${DCAPair.address.toLowerCase()}\nTKNA Address: ${tokenA.address.toLowerCase()}\nTKNB Address: ${tokenB.address.toLowerCase()}\nSwap interval: Daily\nToken ID: 1\n\n⚠️ DISCLAIMER: Due diligence is imperative when assessing this NFT. Make sure token addresses match the expected tokens, as token symbols may be imitated.`
    );
    expect(isValidSvgImage(image)).to.be.true;
  });

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
