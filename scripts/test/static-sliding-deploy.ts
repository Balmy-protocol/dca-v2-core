import { BigNumber } from '@ethersproject/bignumber';
import { utils } from 'ethers';
import { ethers } from 'hardhat';
import moment from 'moment';

async function main() {
  const staticSlidingOracleFactory = await ethers.getContractFactory('contracts/mocks/StaticSlidingOracle.sol:StaticSlidingOracle');
  const staticSlidingOracle = await staticSlidingOracleFactory.deploy(utils.parseEther('1'), 18);
  console.log('static sliding oracle', staticSlidingOracle.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
