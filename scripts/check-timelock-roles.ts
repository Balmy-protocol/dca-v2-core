import { TimelockController } from '@typechained';
import { ethers } from 'hardhat';
import inquirer from 'inquirer';

async function main() {
  return new Promise<void>(async (resolve, reject) => {
    inquirer
      .prompt([
        {
          type: 'input',
          name: 'account',
          message: `What's the account address?`,
        },
      ])
      .then(async (answers) => {
        const { account } = answers;
        const timelock = await ethers.getContract<TimelockController>('Timelock');
        console.log(`${account} role's summary:`);
        console.log('Timelock admin role:', await timelock.hasRole(await timelock.TIMELOCK_ADMIN_ROLE(), account));
        console.log('Executor role:', await timelock.hasRole(await timelock.EXECUTOR_ROLE(), account));
        console.log('Proposer role:', await timelock.hasRole(await timelock.PROPOSER_ROLE(), account));
        resolve();
      })
      .catch(reject);
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
