import { run, ethers } from 'hardhat';

async function main() {
  run('compile');
  const Greeter = await ethers.getContractFactory('Greeter');
  const greeter = await Greeter.deploy('Hello, Hardhat!');
  console.log('Greeter deployed to:', greeter.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
