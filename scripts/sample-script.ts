import { BigNumber } from '@ethersproject/bignumber';
import { ethers } from 'hardhat';
import moment from 'moment';

async function main() {
  const globalParameters = await ethers.getContract('GlobalParameters');
  const factory = await ethers.getContract('Factory');
  const allowedSwapIntervals = await globalParameters.allowedSwapIntervals();
  console.log(
    'Current swap intervals',
    allowedSwapIntervals.map((si: number) => moment.duration(si, 'seconds').humanize())
  );
  // await factory.createPair('0xc778417e063141139fce010982780140aa0cd5ab', '0xad6d458402f60fd3bd25163575031acdce07538d', { gasLimit: 5000000 });
  console.log('Pairs', await factory.allPairs(0));
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
