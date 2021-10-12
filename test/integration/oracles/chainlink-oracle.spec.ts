import { utils } from 'ethers';
import { deployments, ethers } from 'hardhat';
import { ChainlinkOracle } from '@typechained';
import { getNodeUrl } from '@utils/network';
import { evm } from '@test-utils';
import { contract, then } from '@test-utils/bdd';
import { expect } from 'chai';
import { getLastPrice, convertPriceToBigNumberWithDecimals } from '@test-utils/coingecko';

let oracle: ChainlinkOracle;

const WETH = { address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', decimals: 18, symbol: 'WETH' };
const USDC = { address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', decimals: 6, symbol: 'USDC' };
const USDT = { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6, symbol: 'USDT' };
const AAVE = { address: '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9', decimals: 18, symbol: 'AAVE' };
const COMP = { address: '0xc00e94cb662c3520282e6f5717214004a7f26888', decimals: 18, symbol: 'COMP' };
const BNT = { address: '0x1f573d6fb3f13d689ff844b4ce37794d79a7ff1c', decimals: 18, symbol: 'BNT' };
const CRV = { address: '0xD533a949740bb3306d119CC777fa900bA034cd52', decimals: 18, symbol: 'CRV' };

const PAIRS = [
  { tokenA: WETH, tokenB: USDT, price: () => getLastPrice('ethereum', 'usd') }, // TOKEN_A_IS_ETH_TOKEN_B_IS_USD
  { tokenA: USDC, tokenB: WETH, price: () => getLastPrice('usd-coin', 'eth') }, // TOKEN_A_IS_USD_TOKEN_B_IS_ETH
  { tokenA: AAVE, tokenB: USDT, price: () => getLastPrice('aave', 'usd') }, // TOKEN_A_TO_USD
  { tokenA: USDC, tokenB: COMP, price: () => getLastPrice('compound-governance-token', 'usd') }, // TOKEN_B_TO_USD
  { tokenA: BNT, tokenB: WETH, price: () => getLastPrice('bancor', 'eth') }, // TOKEN_A_TO_ETH
  { tokenA: WETH, tokenB: CRV, price: () => getLastPrice('curve-dao-token', 'eth') }, // TOKEN_B_TO_ETH
  // TOKEN_A_TO_ETH_TO_USD,
  // TOKEN_B_TO_ETH_TO_USD,
  // TOKEN_A_TO_USD_TO_ETH,
  // TOKEN_B_TO_USD_TO_ETH,
  // TOKEN_A_TO_USD_TO_TOKEN_B,
  // TOKEN_B_TO_USD_TO_TOKEN_A,
  // TOKEN_A_TO_ETH_TO_TOKEN_B,
  // TOKEN_B_TO_ETH_TO_TOKEN_A,
  // TOKEN_A_TO_USD_TO_ETH_TO_TOKEN_B,
  // TOKEN_B_TO_USD_TO_ETH_TO_TOKEN_A,
  // TOKEN_A_TO_ETH_TO_USD_TO_TOKEN_B,
  // TOKEN_B_TO_ETH_TO_USD_TO_TOKEN_A
];

contract.only('ChainlinkOracle', () => {
  before(async () => {
    await evm.reset({
      jsonRpcUrl: getNodeUrl('mainnet'),
    });
    await deployments.fixture('ChainlinkOracle', { keepExistingDeployments: false });
    oracle = await ethers.getContract('ChainlinkOracle');
    for (const { tokenA, tokenB } of PAIRS) {
      await oracle.addSupportForPairIfNeeded(tokenA.address, tokenB.address);
    }
  });

  for (let i = 0; i < PAIRS.length; i++) {
    const { tokenA, tokenB, price } = PAIRS[i];
    describe(`quote (${tokenA.symbol}, ${tokenB.symbol})`, () => {
      then(`returns correct quote`, async () => {
        const quote = await oracle.quote(tokenA.address, utils.parseUnits('1', tokenA.decimals), tokenB.address);

        const coingeckoPrice = await price();
        const onePercent = coingeckoPrice / 100;
        const upperThreshold = convertPriceToBigNumberWithDecimals(coingeckoPrice + onePercent, tokenB.decimals);
        const lowerThreshold = convertPriceToBigNumberWithDecimals(coingeckoPrice - onePercent, tokenB.decimals);

        expect(
          quote.lte(upperThreshold) && quote.gte(lowerThreshold),
          `Expected ${quote.toString()} to be within [${lowerThreshold.toString()},${upperThreshold.toString()}]`
        );
      });
      then(`pricing plan is the correct one`, async () => {
        const plan = await oracle.planForPair(tokenA.address, tokenB.address);
        expect(plan).to.equal(i + 1);
      });
    });
  }
});
