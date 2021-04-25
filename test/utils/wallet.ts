import { Wallet } from 'ethers';

const generateRandom = async () => {
  const wallet = await Wallet.createRandom();
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
