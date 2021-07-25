import { run, ethers } from 'hardhat';
import moment from 'moment';

async function main() {
  const globalParamters = await ethers.getContract('GlobalParameters');
  const [, governor] = await ethers.getSigners();
  await globalParamters.connect(governor).addSwapIntervalsToAllowedList([moment.duration('5', 'minutes').as('seconds')], ['5 minutely']);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
