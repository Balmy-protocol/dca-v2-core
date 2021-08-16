import { ethers, deployments } from 'hardhat';
import { run } from 'hardhat';

async function main() {
  console.time('Verifying pair ...');
  const PAIR_ADDRESS = '';
  const pair = await ethers.getContractAt('contracts/DCAPair/DCAPair.sol:DCAPair', PAIR_ADDRESS);
  const globalParameters = await deployments.getOrNull('GlobalParameters');
  await run('verify:verify', {
    address: PAIR_ADDRESS,
    constructorArguments: [globalParameters!.address, await pair.tokenA(), await pair.tokenB()],
    contract: 'contracts/DCAPair/DCAPair.sol:DCAPair',
  });
  console.timeEnd('Verifying pair ...');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
