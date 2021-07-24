import { run, ethers } from 'hardhat';

async function main() {
  run('compile');
  const [, governor] = await ethers.getSigners();
  const DCASwapper = await ethers.getContract('Swapper', governor);
  const tx = await DCASwapper.startWatchingPairs(['0x81d2b6296352765e4d73be089e1dd8499fc0da14', '0xa35432c76c6df79376ba5bcefe8c344661cdeef1']);
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
