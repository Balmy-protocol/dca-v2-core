import { Wallet } from 'ethers';
import { ethers } from 'hardhat';

const generateRandom = async () => {
  const wallet = (await Wallet.createRandom()).connect(ethers.provider);
  return wallet;
};

const generateRandomAddress = async () => {
  const wallet = await Wallet.createRandom();
  return wallet.address;
};

export default {
  generateRandom,
  generateRandomAddress,
};
