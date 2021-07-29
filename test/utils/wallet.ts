import { Wallet } from 'ethers';
import { getAddress } from 'ethers/lib/utils';
import { ethers, network } from 'hardhat';
import { randomHex } from 'web3-utils';
import { JsonRpcSigner } from '@ethersproject/providers';

const impersonate = async (address: string): Promise<JsonRpcSigner> => {
  await network.provider.request({
    method: 'hardhat_impersonateAccount',
    params: [address],
  });
  return ethers.provider.getSigner(address);
};
const generateRandom = async () => {
  const wallet = (await Wallet.createRandom()).connect(ethers.provider);
  return wallet;
};

export const generateRandomAddress = () => {
  return getAddress(randomHex(20));
};

export default {
  impersonate,
  generateRandom,
  generateRandomAddress,
};
