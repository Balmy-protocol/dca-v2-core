import { TransactionResponse } from '@ethersproject/abstract-provider';
import { utils } from 'ethers';
import { ethers } from 'hardhat';
import moment from 'moment';

async function main() {
  const [deployer, governor, feeRecipient, marketMaker] = await ethers.getSigners();
  console.log('market maker', marketMaker.address);
  const pair = await ethers.getContractAt(
    'contracts/DCAPair/DCAPair.sol:DCAPair',
    '0x884e975bd845f0f1fb75f1233580620541ed34e5', // uni-weth ropsten
    marketMaker
  );
  const seconds = await pair.secondsUntilNextSwap();
  console.log('seconds until next swap', await pair.secondsUntilNextSwap());
  if (seconds > 0) process.exit(0);
  const nextSwapInfo = await pair.getNextSwapInfo();
  // console.log('next swap info', nextSwapInfo);
  const token = await ethers.getContractAt('contracts/mocks/ERC20Mock.sol:ERC20Mock', nextSwapInfo.tokenToBeProvidedBySwapper, marketMaker);
  console.log(
    'needs to send',
    utils.formatEther(nextSwapInfo.amountToBeProvidedBySwapper),
    'of',
    await token.symbol(),
    `${nextSwapInfo.tokenToBeProvidedBySwapper}`
  );
  console.log('current mm balance', utils.formatEther(await token.balanceOf(marketMaker.address)), 'of', await token.symbol());
  if (nextSwapInfo.amountToBeProvidedBySwapper.gt(await token.balanceOf(marketMaker.address))) process.exit(0);
  await token.connect(deployer).transfer(marketMaker.address, nextSwapInfo.amountToBeProvidedBySwapper);
  const tx = (await token.transfer(pair.address, nextSwapInfo.amountToBeProvidedBySwapper)) as TransactionResponse;
  console.log('sent', utils.formatEther(nextSwapInfo.amountToBeProvidedBySwapper), 'of', nextSwapInfo.tokenToBeProvidedBySwapper);
  await tx.wait(2);
  await pair['swap()']();
  console.log('swapped');
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
