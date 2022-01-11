import { Wallet } from 'ethers';
import { ethers, network } from 'hardhat';
import { JsonRpcSigner } from '@ethersproject/providers';

const impersonate = async (address: string): Promise<JsonRpcSigner> => {
  await network.provider.request({
    method: 'hardhat_impersonateAccount',
    params: [address],
  });
  return ethers.provider.getSigner(address);
};
const generateRandom = async () => {
  const wallet = Wallet.createRandom().connect(ethers.provider);
  await ethers.provider.send('hardhat_setBalance', [wallet.address, '0xffffffffffffffffffffffffffffffff']);
  return wallet;
};

// Note: we are hardcoding the random address to make tests deterministic. We couldn't generate a random address by using a seed
export const generateRandomAddress = () => '0x37601c8d013fA4DFA82e9C0d416b70143f4cbFcF';
export const generateRandomAddress2 = () => '0x37601C8D013fA4dfA82e9C0d416B70143f4cBfcc';

export default {
  impersonate,
  generateRandom,
  generateRandomAddress,
  generateRandomAddress2,
};
