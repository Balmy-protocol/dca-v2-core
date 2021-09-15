import axios from 'axios';
import { BigNumber, utils } from 'ethers';

type CoingeckoDataPoints = {
  prices: [number, number][];
  market_caps: [number, number][];
  total_volumes: [number, number][];
};

export const getCoingeckoDataPoints = async (coin: string, currency: string, from: number, to: number): Promise<CoingeckoDataPoints> => {
  const response = await axios.get(
    `https://api.coingecko.com/api/v3/coins/${coin}/market_chart/range?vs_currency=${currency}&from=${from}&to=${to}`
  );
  console.log('status', response.status);
  console.log('response', response);
  const coingeckoDatapoints = response.data as CoingeckoDataPoints;
  return coingeckoDatapoints;
};

export const getLastPrice = async (coin: string, currency: string, from: number, to: number): Promise<number> => {
  const coingeckoDataPoints = await getCoingeckoDataPoints(coin, currency, from, to);
  return coingeckoDataPoints.prices[0][1];
};

export const convertPriceToBigNumberWithDecimals = (price: number, decimals: number): BigNumber => {
  return utils.parseUnits(`${price.toFixed(6)}`, 6);
};

export const convertPriceToNumberWithDecimals = (price: number, decimals: number): number => {
  return convertPriceToBigNumberWithDecimals(price, decimals).toNumber();
};
