import { BigNumber, Contract, utils } from 'ethers';
import { deployments, ethers } from 'hardhat';
import { getNodeUrl } from '../../../utils/network';
import { evm } from '../../utils';
import { contract, given } from '../../utils/bdd';
import axios from 'axios';
import moment from 'moment';
import { expect } from 'chai';

let oracle: Contract;
let startingTime: number;
let oraclePeriod: number = moment.duration('5', 'minutes').as('seconds');

// 15 USDC as a price threshold
const PRICE_THRESHOLD = 15;
const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';

type CoingeckoDataPoints = {
  prices: [number, number][];
  market_caps: [number, number][];
  total_volumes: [number, number][];
};

contract('UniswapV3Oracle', () => {
  before(async () => {
    startingTime = moment().unix();
    await evm.reset({
      jsonRpcUrl: getNodeUrl('mainnet'),
    });
    await deployments.fixture('UniswapOracle');
    oracle = await ethers.getContract('UniswapOracle');
    await oracle.addSupportForPair(WETH, USDC);
  });

  describe('quote', () => {
    let feedPrice: number;
    given(async () => {
      // Funny thing, coingecko updates this price feed every 5 minute (not a twap, but close enough).
      const coingeckoDatapoints = (
        await axios.get(
          `https://api.coingecko.com/api/v3/coins/ethereum/market_chart/range?vs_currency=usd&from=${
            startingTime - oraclePeriod
          }&to=${startingTime}`
        )
      ).data as CoingeckoDataPoints;
      feedPrice = coingeckoDatapoints.prices[0][1];
    });
    it('returns correct twap', async () => {
      const twap = await oracle.quote(WETH, utils.parseEther('1'), USDC);
      expect(twap).to.be.within(
        utils.parseUnits(`${(feedPrice - PRICE_THRESHOLD).toFixed(6)}`, 6).toNumber(),
        utils.parseUnits(`${(feedPrice + PRICE_THRESHOLD).toFixed(6)}`, 6).toNumber()
      );
    });
  });
});
