import { BigNumber } from '@ethersproject/bignumber';
import axios from 'axios';
import axiosRetry from 'axios-retry';
import qs from 'qs';

axiosRetry(axios, { retries: 3, retryDelay: axiosRetry.exponentialDelay });

export type QuoteRequest = {
  chainId: number;
  sellToken: string;
  buyToken: string;
  sellAmount?: BigNumber | string;
  buyAmount?: BigNumber | string;
  sippagePercentage?: number;
  gasPrice?: BigNumber | string;
  takerAddress?: string;
  excludeSources?: string[] | string;
  includeSources?: string[];
  skipValidation?: boolean;
  intentOnFilling?: boolean;
  buyTokenPercentageFee?: number;
  affiliateAddress?: string;
};

export type QuoteResponse = {
  chainId: number;
  price: string;
  guaranteedPrice: string;
  to: string;
  data: string;
  value: string;
  gas: string;
  estimatedGas: string;
  gasPrice: string;
  protocolFee: string;
  minimumProtocolFee: string;
  buyTokenAddress: string;
  sellTokenAddress: string;
  buyAmount: string;
  sellAmount: string;
  sources: any[];
  orders: any[];
  allowanceTarget: string;
  sellTokenToEthRate: string;
  buyTokenToEthRate: string;
};

export const quote = async (quoteRequest: QuoteRequest): Promise<QuoteResponse> => {
  if (BigNumber.isBigNumber(quoteRequest.sellAmount)) quoteRequest.sellAmount = quoteRequest.sellAmount.toString();
  if (BigNumber.isBigNumber(quoteRequest.buyAmount)) quoteRequest.buyAmount = quoteRequest.buyAmount.toString();
  if (BigNumber.isBigNumber(quoteRequest.gasPrice)) quoteRequest.gasPrice = quoteRequest.gasPrice.toString();

  quoteRequest.excludeSources = (quoteRequest.excludeSources as string[]) ?? [];
  quoteRequest.excludeSources.push('Mesh');
  quoteRequest.excludeSources = quoteRequest.excludeSources.join(',');

  let response: any;
  try {
    response = await axios.get(`https://api.0x.org/swap/v1/quote?${qs.stringify(quoteRequest)}`);
  } catch (err) {
    console.log(err.response.data);
    throw new Error(`Error code: ${err.response.data.code}. Reason: ${err.response.data.reason}`);
  }
  return response.data as QuoteResponse;
};

export default {
  quote,
};
