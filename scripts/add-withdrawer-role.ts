import { DCAHub, TimelockController } from '@typechained';
import { constants } from 'ethers';
import { deployments, ethers } from 'hardhat';
import hre, { run } from 'hardhat';
import { randomHex } from 'web3-utils';

async function main() {
  const { governor } = await hre.getNamedAccounts();
  const timelock = await ethers.getContract<TimelockController>('Timelock');
  const hub = await ethers.getContract<DCAHub>('DCAHub');
  const populatedData = await hub.populateTransaction.grantRole(await hub.PLATFORM_WITHDRAW_ROLE(), governor);
  console.log('Timelock address:', timelock.address);
  console.log('Target:', hub.address);
  console.log('Value:', 0);
  console.log('Data:', populatedData.data!);
  console.log('Predecessor:', constants.HashZero);
  console.log('Salt:', randomHex(32));
  console.log('Min delay:', (await timelock.getMinDelay()).toNumber());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
