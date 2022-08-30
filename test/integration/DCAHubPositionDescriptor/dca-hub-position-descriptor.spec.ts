import moment from 'moment';
import { BigNumber, constants, utils } from 'ethers';
import { deployments, ethers, getNamedAccounts } from 'hardhat';
import { evm, wallet } from '@test-utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { abi as IERC20_ABI } from '@openzeppelin/contracts/build/contracts/IERC20.json';
import { readArgFromEventOrFail } from '@test-utils/event-utils';
import { DCAHub, DCAHubSwapCalleeMock, DCAHubSwapCalleeMock__factory, DCAPermissionsManager, IERC20 } from '@typechained';
import isSvg from 'is-svg';
import { expect } from 'chai';
import { buildSwapInput } from 'js-lib/swap-utils';
import { DeterministicFactory, DeterministicFactory__factory } from '@mean-finance/deterministic-factory';

const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const USDC_ADDRESS = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const WETH_WHALE_ADDRESS = '0xf04a5cc80b1e94c69b48f5ee68a08cd2f09a7c3e';
const USDC_WHALE_ADDRESS = '0xcffad3200574698b78f32232aa9d63eabd290703';

describe('DCAHubPositionDescriptor', () => {
  let joe: SignerWithAddress;
  let WETH: IERC20, USDC: IERC20;
  let DCAHub: DCAHub;
  let DCAPermissionsManager: DCAPermissionsManager;
  let DCAHubSwapCallee: DCAHubSwapCalleeMock;
  const SWAP_INTERVAL = moment.duration(1, 'hour').as('seconds');

  before('Setup accounts and contracts', async () => {
    [joe] = await ethers.getSigners();

    await evm.reset({
      network: 'ethereum',
      blockNumber: 15283061,
    });

    const { eoaAdmin, deployer, msig } = await getNamedAccounts();
    const deployerAdmin = await wallet.impersonate(eoaAdmin);
    const admin = await wallet.impersonate(msig);
    await ethers.provider.send('hardhat_setBalance', [eoaAdmin, '0xffffffffffffffff']);
    await ethers.provider.send('hardhat_setBalance', [msig, '0xffffffffffffffff']);

    const deterministicFactory = await ethers.getContractAt<DeterministicFactory>(
      DeterministicFactory__factory.abi,
      '0xbb681d77506df5CA21D2214ab3923b4C056aa3e2'
    );

    await deterministicFactory.connect(deployerAdmin).grantRole(await deterministicFactory.DEPLOYER_ROLE(), deployer);
    await deployments.run(['ChainlinkFeedRegistry', 'TransformerRegistry', 'TransformerOracle', 'DCAHubPositionDescriptor', 'DCAHub'], {
      resetMemory: true,
      deletePreviousDeployments: false,
      writeDeploymentsToFiles: false,
    });

    DCAPermissionsManager = await ethers.getContract('PermissionsManager');
    DCAHub = await ethers.getContract('DCAHub');
    WETH = await ethers.getContractAt(IERC20_ABI, WETH_ADDRESS);
    USDC = await ethers.getContractAt(IERC20_ABI, USDC_ADDRESS);

    // Needed to execute swaps
    const factory: DCAHubSwapCalleeMock__factory = await ethers.getContractFactory('contracts/mocks/DCAHubSwapCallee.sol:DCAHubSwapCalleeMock');
    DCAHubSwapCallee = await factory.deploy();
    await DCAHubSwapCallee.avoidRewardCheck();
    await DCAHub.connect(admin).grantRole(await DCAHub.PRIVILEGED_SWAPPER_ROLE(), joe.address);

    await distributeTokensToUsers();
    await WETH.connect(joe).approve(DCAHub.address, constants.MaxUint256);
    await DCAHub.connect(admin).setAllowedTokens([WETH.address, USDC.address], [true, true]);
  });

  it('Validate tokenURI result', async () => {
    // Deposit
    const response = await DCAHub['deposit(address,address,uint256,uint32,uint32,address,(address,uint8[])[])'](
      WETH.address,
      USDC.address,
      utils.parseEther('20'),
      2,
      SWAP_INTERVAL,
      joe.address,
      []
    );
    const tokenId = await readArgFromEventOrFail<BigNumber>(response, 'Deposited', 'positionId');
    const result1 = await DCAPermissionsManager.tokenURI(tokenId);
    const { name: name1, description: description1, image: image1 } = extractJSONFromURI(result1);

    // Execute one swap
    await swap();

    // Get token uri
    const result2 = await DCAPermissionsManager.tokenURI(tokenId);
    const { name: name2, description: description2, image: image2 } = extractJSONFromURI(result2);

    // Execute the last swap and withdraw
    await swap();

    const result3 = await DCAPermissionsManager.tokenURI(tokenId);
    const { name: name3, description: description3, image: image3 } = extractJSONFromURI(result3);

    await DCAHub.connect(joe).withdrawSwapped(tokenId, wallet.generateRandomAddress());

    // Get token uri
    const result4 = await DCAPermissionsManager.tokenURI(tokenId);
    const { name: name4, description: description4, image: image4 } = extractJSONFromURI(result4);

    expect(name1).to.equal('Mean Finance DCA - Hourly - WETH ➔ USDC');
    expect(description1).to.equal(
      `This NFT represents a DCA position in Mean Finance, where WETH will be swapped for USDC. The owner of this NFT can modify or redeem the position.\n\nWETH Address: ${WETH.address.toLowerCase()}\nUSDC Address: ${USDC.address.toLowerCase()}\nSwap interval: Hourly\nToken ID: 1\n\n⚠️ DISCLAIMER: Due diligence is imperative when assessing this NFT. Make sure token addresses match the expected tokens, as token symbols may be imitated.`
    );
    expect(name2).to.equal(name1);
    expect(name3).to.equal(name1);
    expect(name4).to.equal(name1);
    expect(description2).to.equal(description1);
    expect(description3).to.equal(description1);
    expect(description4).to.equal(description1);
    expect(isValidSvgImage(image1)).to.be.true;
    expect(isValidSvgImage(image2)).to.be.true;
    expect(isValidSvgImage(image3)).to.be.true;
    expect(isValidSvgImage(image4)).to.be.true;
  });

  async function distributeTokensToUsers() {
    const wethWhale = await wallet.impersonate(WETH_WHALE_ADDRESS);
    const usdcWhale = await wallet.impersonate(USDC_WHALE_ADDRESS);
    await ethers.provider.send('hardhat_setBalance', [WETH_WHALE_ADDRESS, '0xffffffffffffffff']);
    await ethers.provider.send('hardhat_setBalance', [USDC_WHALE_ADDRESS, '0xffffffffffffffff']);
    await WETH.connect(wethWhale).transfer(joe.address, BigNumber.from(10).pow(22));
    await USDC.connect(usdcWhale).transfer(DCAHubSwapCallee.address, BigNumber.from(10).pow(12));
  }

  async function swap() {
    const { tokens, pairIndexes, borrow } = buildSwapInput([{ tokenA: WETH.address, tokenB: USDC.address }], []);
    await DCAHub.swap(tokens, pairIndexes, DCAHubSwapCallee.address, DCAHubSwapCallee.address, borrow, [], []);
    await evm.advanceTimeAndBlock(SWAP_INTERVAL);
  }

  function isValidSvgImage(base64: string) {
    const encodedImage = base64.substring('data:image/svg+xml;base64,'.length);
    const decodedImage = Buffer.from(encodedImage, 'base64').toString('utf8');
    return isSvg(decodedImage);
  }

  function extractJSONFromURI(uri: string): { name: string; description: string; image: string } {
    const encodedJSON = uri.substring('data:application/json;base64,'.length);
    const decodedJSON = Buffer.from(encodedJSON, 'base64').toString('utf8');
    return JSON.parse(decodedJSON);
  }
});
