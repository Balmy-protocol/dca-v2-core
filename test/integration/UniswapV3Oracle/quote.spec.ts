import { Contract, utils } from 'ethers';
import { deployments, ethers } from 'hardhat';
import { getNodeUrl } from '../../../utils/network';
import { evm } from '../../utils';
import { contract, given, then } from '../../utils/bdd';
import moment from 'moment';
import { expect } from 'chai';
import { getLastPrice, convertPriceToNumberWithDecimals } from '../../utils/coingecko';

let oracle: Contract;
let startingTime: number;
let oraclePeriod: number = moment.duration('7', 'minutes').as('seconds');

// 15 USDC as a price threshold
const PRICE_THRESHOLD = 15;
const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';

const UNI_WETH_USDC_POOL_LOW = '0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640';
const UNI_WETH_USDC_POOL_MEDIUM = '0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8';
const UNI_WETH_USDC_POOL_HIGH = '0x7BeA39867e4169DBe237d55C8242a8f2fcDcc387';

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
      feedPrice = await getLastPrice('ethereum', 'usd', startingTime - oraclePeriod, startingTime);
    });
    then('all USDC/WETH pools are used', async () => {
      expect(await oracle.poolsUsedForPair(WETH, USDC)).to.eql([UNI_WETH_USDC_POOL_LOW, UNI_WETH_USDC_POOL_MEDIUM, UNI_WETH_USDC_POOL_HIGH]);
    });
    then('returns correct twap', async () => {
      const twap = await oracle.quote(WETH, utils.parseEther('1'), USDC);
      expect(twap).to.be.within(
        convertPriceToNumberWithDecimals(feedPrice - PRICE_THRESHOLD, 6),
        convertPriceToNumberWithDecimals(feedPrice + PRICE_THRESHOLD, 6)
      );
    });
  });
});
