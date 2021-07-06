import { BigNumber } from '@ethersproject/bignumber';
import { utils } from 'ethers';
import { ethers } from 'hardhat';
import moment from 'moment';

async function main() {
  const staticSlidingOracle = await ethers.getContractAt(
    'contracts/mocks/StaticSlidingOracle.sol:StaticSlidingOracle',
    '0x84F4BC40C227CEF248ec5b46e7A44947D7D2F94a'
  );
  const rate = utils.parseEther('100');
  await staticSlidingOracle.setRate(rate, 18);
  console.log('new rate', utils.formatEther(rate));
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
