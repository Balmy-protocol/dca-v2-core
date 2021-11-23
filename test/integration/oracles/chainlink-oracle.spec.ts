import { utils } from 'ethers';
import { deployments, ethers } from 'hardhat';
import { ChainlinkOracle } from '@typechained';
import { getNodeUrl } from '@utils/network';
import { evm } from '@test-utils';
import { contract, given, then } from '@test-utils/bdd';
import { expect } from 'chai';
import { getLastPrice, convertPriceToBigNumberWithDecimals } from '@test-utils/coingecko';

let oracle: ChainlinkOracle;

const WETH = { address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', decimals: 18, symbol: 'WETH', id: 'ethereum' };
const USDC = { address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', decimals: 6, symbol: 'USDC', id: 'usd-coin' };
const USDT = { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6, symbol: 'USDT', id: 'tether' };
const AAVE = { address: '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9', decimals: 18, symbol: 'AAVE', id: 'aave' };
const COMP = { address: '0xc00e94cb662c3520282e6f5717214004a7f26888', decimals: 18, symbol: 'COMP', id: 'compound-governance-token' };
const BNT = { address: '0x1f573d6fb3f13d689ff844b4ce37794d79a7ff1c', decimals: 18, symbol: 'BNT', id: 'bancor' };
const CRV = { address: '0xD533a949740bb3306d119CC777fa900bA034cd52', decimals: 18, symbol: 'CRV', id: 'curve-dao-token' };
const AMP = { address: '0xff20817765cb7f73d4bde2e66e067e58d11095c2', decimals: 18, symbol: 'AMP', id: 'amp-token' };
const FXS = { address: '0x3432b6a60d23ca0dfca7761b7ab56459d9c964d0', decimals: 18, symbol: 'FXS', id: 'frax-share' };
const ALCX = { address: '0xdbdb4d16eda451d0503b854cf79d55697f90c8df', decimals: 18, symbol: 'ALCX', id: 'alchemix' };
const MANA = { address: '0x0f5d2fb29fb7d3cfee444a200298f468908cc942', decimals: 18, symbol: 'MANA', id: 'decentraland' };
const AXS = { address: '0xbb0e17ef65f82ab018d8edd776e8dd940327b28b', decimals: 18, symbol: 'AXS', id: 'axie-infinity' };
const CREAM = { address: '0x2ba592F78dB6436527729929AAf6c908497cB200', decimals: 18, symbol: 'CREAM', id: 'cream-2' };
const MATIC = { address: '0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0', decimals: 18, symbol: 'MATIC', id: 'matic-network' };
const WBTC = { address: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', decimals: 8, symbol: 'WBTC', id: 'wrapped-bitcoin' };

const PLANS: { tokenIn: Token; tokenOut: Token; price: PriceComparison }[][] = [
  [
    // ETH_USD_PAIR
    { tokenIn: WETH, tokenOut: USDT, price: { quote: 'IN', currency: 'usd' } }, // IN is ETH, OUT is USD
    { tokenIn: USDC, tokenOut: WETH, price: { quote: 'IN', currency: 'eth' } }, // IN is USD, OUT is ETH
  ],
  [
    // TOKEN_USD_PAIR
    { tokenIn: AAVE, tokenOut: USDT, price: { quote: 'IN', currency: 'usd' } }, // IN (tokenA) => OUT (tokenB) is USD
    { tokenIn: CRV, tokenOut: USDC, price: { quote: 'IN', currency: 'usd' } }, // IN (tokenB) => OUT (tokenA) is USD
    { tokenIn: USDC, tokenOut: COMP, price: { quote: 'OUT', currency: 'usd' } }, // IN (tokenA) is USD => OUT (tokenB)
    { tokenIn: USDT, tokenOut: WBTC, price: { quote: 'OUT', currency: 'usd' } }, // IN (tokenB) is USD => OUT (tokenA)
  ],
  [
    // TOKEN_ETH_PAIR
    { tokenIn: BNT, tokenOut: WETH, price: { quote: 'IN', currency: 'eth' } }, // IN (tokenA) => OUT (tokenB) is ETH
    { tokenIn: AXS, tokenOut: WETH, price: { quote: 'IN', currency: 'eth' } }, // IN (tokenB) => OUT (tokenA) is ETH
    { tokenIn: WETH, tokenOut: WBTC, price: { quote: 'OUT', currency: 'eth' } }, // IN (tokenB) is ETH => OUT (tokenA)
    { tokenIn: WETH, tokenOut: CRV, price: { quote: 'OUT', currency: 'eth' } }, // IN (tokenA) is ETH => OUT (tokenB)
  ],
  [
    // TOKEN_TO_USD_TO_TOKEN_PAIR
    { tokenIn: WBTC, tokenOut: COMP, price: { quote: 'BOTH', currency: 'usd' } }, // IN (tokenA) => USD => OUT (tokenB)
    { tokenIn: AMP, tokenOut: FXS, price: { quote: 'BOTH', currency: 'usd' } }, // IN (tokenB) => USD => OUT (tokenA)
  ],
  [
    // TOKEN_TO_ETH_TO_TOKEN_PAIR
    { tokenIn: CREAM, tokenOut: AXS, price: { quote: 'BOTH', currency: 'eth' } }, // IN (tokenA) => ETH => OUT (tokenB)
    { tokenIn: ALCX, tokenOut: MANA, price: { quote: 'BOTH', currency: 'eth' } }, // IN (tokenB) => ETH => OUT (tokenA)
  ],
  [
    // TOKEN_A_TO_USD_TO_ETH_TO_TOKEN_B
    { tokenIn: FXS, tokenOut: WETH, price: { quote: 'IN', currency: 'eth' } }, // IN (tokenA) => USD, OUT (tokenB) is ETH
    { tokenIn: WETH, tokenOut: MATIC, price: { quote: 'OUT', currency: 'eth' } }, // IN (tokenB) is ETH, USD => OUT (tokenA)

    { tokenIn: USDC, tokenOut: AXS, price: { quote: 'OUT', currency: 'usd' } }, // IN (tokenA) is USD, ETH => OUT (tokenB)
    { tokenIn: ALCX, tokenOut: USDT, price: { quote: 'IN', currency: 'usd' } }, // IN (tokenB) => ETH, OUT is USD (tokenA)

    { tokenIn: FXS, tokenOut: AXS, price: { quote: 'BOTH', currency: 'usd' } }, // IN (tokenA) => USD, ETH => OUT (tokenB)
    { tokenIn: ALCX, tokenOut: MATIC, price: { quote: 'BOTH', currency: 'usd' } }, // IN (tokenB) => ETH, USD => OUT (tokenA)
  ],
  [
    // TOKEN_A_TO_ETH_TO_USD_TO_TOKEN_B
    { tokenIn: MANA, tokenOut: USDC, price: { quote: 'IN', currency: 'usd' } }, // IN (tokenA) => ETH, OUT (tokenB) is USD
    { tokenIn: USDT, tokenOut: AXS, price: { quote: 'OUT', currency: 'usd' } }, // IN (tokenB) is USD, ETH => OUT (tokenA)

    { tokenIn: WETH, tokenOut: AMP, price: { quote: 'BOTH', currency: 'eth' } }, // IN (tokenA) is ETH, USD => OUT (tokenB)
    { tokenIn: AMP, tokenOut: WETH, price: { quote: 'BOTH', currency: 'eth' } }, // IN (tokenB) => USD, OUT is ETH (tokenA)

    { tokenIn: AXS, tokenOut: AMP, price: { quote: 'BOTH', currency: 'usd' } }, // IN (tokenA) => ETH, USD => OUT (tokenB)
    { tokenIn: FXS, tokenOut: MANA, price: { quote: 'BOTH', currency: 'usd' } }, // IN (tokenB) => USD, ETH => OUT (tokenA)
  ],
];

const TRESHOLD_PERCENTAGE = 2.5; // In mainnet, max threshold is usually 2%, but since we are combining pairs, it can sometimes be a little higer

contract('ChainlinkOracle', () => {
  before(async () => {
    await evm.reset({
      jsonRpcUrl: getNodeUrl('mainnet'),
    });
    await deployments.fixture('ChainlinkOracle', { keepExistingDeployments: false });
    oracle = await ethers.getContract('ChainlinkOracle');
  });

  for (let i = 0; i < PLANS.length; i++) {
    for (const { tokenIn, tokenOut, price } of PLANS[i]) {
      describe(`quote (${tokenIn.symbol}, ${tokenOut.symbol})`, () => {
        given(async () => {
          await oracle.addSupportForPairIfNeeded(tokenIn.address, tokenOut.address);
        });
        then(`returns correct quote`, async () => {
          const quote = await oracle.quote(tokenIn.address, utils.parseUnits('1', tokenIn.decimals), tokenOut.address);

          const coingeckoPrice = await getPriceBetweenTokens(tokenIn, tokenOut, price);
          const expected = convertPriceToBigNumberWithDecimals(coingeckoPrice, tokenOut.decimals);
          const threshold = expected.mul(TRESHOLD_PERCENTAGE * 10).div(100 * 10);
          const [upperThreshold, lowerThreshold] = [expected.add(threshold), expected.sub(threshold)];
          const diff = quote.sub(expected);
          const sign = diff.isNegative() ? '-' : '+';
          const diffPercentage = diff.abs().mul(10000).div(expected).toNumber() / 100;

          expect(
            quote.lte(upperThreshold) && quote.gte(lowerThreshold),
            `Expected ${quote.toString()} to be within [${lowerThreshold.toString()},${upperThreshold.toString()}]. Diff was ${sign}${diffPercentage}%`
          ).to.be.true;
        });
        then(`pricing plan is the correct one`, async () => {
          const plan1 = await oracle.planForPair(tokenIn.address, tokenOut.address);
          const plan2 = await oracle.planForPair(tokenOut.address, tokenIn.address);
          expect(plan1 + plan2).to.equal(i + 1);
          expect(plan1 == 0 || plan2 == 0).to.be.true;
        });
      });
    }
  }
});

async function getPriceBetweenTokens(tokenA: Token, tokenB: Token, compare: PriceComparison) {
  if (compare.quote === 'IN') {
    return fetchPrice(tokenA.id, compare.currency);
  } else if (compare.quote === 'OUT') {
    return 1 / (await fetchPrice(tokenB.id, compare.currency));
  } else {
    const tokenAPrice = await fetchPrice(tokenA.id, compare.currency);
    const tokenBPrice = await fetchPrice(tokenB.id, compare.currency);
    return tokenAPrice / tokenBPrice;
  }
}

let priceCache: Map<string, number> = new Map();
async function fetchPrice(id: string, currency: string): Promise<number> {
  const key = `${id}-${currency}`;
  if (!priceCache.has(key)) {
    const price = await getLastPrice(id, currency);
    priceCache.set(key, price);
  }
  return priceCache.get(key)!;
}

type PriceComparison = {
  quote: 'IN' | 'OUT' | 'BOTH';
  currency: 'usd' | 'eth';
};

type Token = { address: string; decimals: number; symbol: string; id: string };
