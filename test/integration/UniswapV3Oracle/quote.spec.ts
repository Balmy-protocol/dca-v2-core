import { getNodeUrl } from '../../../utils/network';
import { evm } from '../../utils';
import { contract } from '../../utils/bdd';

contract('UniswapV3Oracle', () => {
  // Calculate TWAP with: https://api.coingecko.com/api/v3/coins/ethereum/market_chart/range?vs_currency=usd&from=1626201793&to=1626203793

  beforeEach(async () => {
    await evm.reset({
      jsonRpcUrl: getNodeUrl('mainnet'),
      blockNumber: 12820599,
    });
  });

  describe('quote', () => {
    it('returns correct twap');
  });
});
