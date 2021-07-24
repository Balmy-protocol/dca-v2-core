import { run, ethers } from 'hardhat';

async function main() {
  run('compile');
  const [, governor] = await ethers.getSigners();
  const DCASwapper = await ethers.getContract('Swapper', governor);
  const tx = await DCASwapper.startWatchingPairs(['0x92D53D59f366E2F6A7A25bBC8Ff2F2FF096819fe']);
  console.log('Start watching pairs tx', tx.hash);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
