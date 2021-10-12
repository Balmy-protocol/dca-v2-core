import { utils } from 'ethers';
import { deployments, ethers } from 'hardhat';
import { ChainlinkOracle } from '@typechained';
import { getNodeUrl } from '@utils/network';
import { evm } from '@test-utils';
import { contract, then } from '@test-utils/bdd';
import { expect } from 'chai';
import { getLastPrice, convertPriceToNumberWithDecimals } from '@test-utils/coingecko';

let oracle: ChainlinkOracle;

const WETH = { address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', decimals: 18, symbol: 'WETH' };
const USDC = { address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', decimals: 6, symbol: 'USDC' };
const USDT = { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6, symbol: 'USDT' };

const PAIRS = [
  { tokenA: WETH, tokenB: USDT, price: () => getLastPrice('ethereum', 'usd') }, // TOKEN_A_IS_ETH_TOKEN_B_IS_USD
  { tokenA: USDC, tokenB: WETH, price: () => getLastPrice('usd-coin', 'eth') }, // TOKEN_A_IS_USD_TOKEN_B_IS_ETH
];

contract('ChainlinkOracle', () => {
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
        const coingeckoPrice = await price();
        const onePercent = coingeckoPrice / 100;

        const quote = await oracle.quote(tokenA.address, utils.parseUnits('1', tokenA.decimals), tokenB.address);
        expect(quote).to.be.within(
          convertPriceToNumberWithDecimals(coingeckoPrice - onePercent, tokenB.decimals),
          convertPriceToNumberWithDecimals(coingeckoPrice + onePercent, tokenB.decimals)
        );
      });
      then(`pricing plan is the correct one`, async () => {
        const plan = await oracle.planForPair(tokenA.address, tokenB.address);
        expect(plan).to.equal(i + 1);
      });
    });
  }
});
