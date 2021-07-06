import { utils } from 'ethers';
import { ethers, getNamedAccounts } from 'hardhat';

async function main() {
  const { deployer, governor, feeRecipient, marketMaker } = await getNamedAccounts();
  await ethers.provider.send('hardhat_setBalance', [deployer, '0xfffffffffffffff']);
  await ethers.provider.send('hardhat_setBalance', [governor, '0xfffffffffffffff']);
  await ethers.provider.send('hardhat_setBalance', [feeRecipient, '0xfffffffffffffff']);
  await ethers.provider.send('hardhat_setBalance', [marketMaker, '0xfffffffffffffff']);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
