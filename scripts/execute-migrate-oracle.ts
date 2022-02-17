import wallet from '@test-utils/wallet';
import { DCAHub, OracleAggregator } from '@typechained';
import { constants } from 'ethers';
import { hexZeroPad } from 'ethers/lib/utils';
import { deployments, ethers } from 'hardhat';
import { run } from 'hardhat';
import moment from 'moment';

async function main() {
  const timelock = await ethers.getContract('Timelock');
  const hub = await ethers.getContract<DCAHub>('DCAHub');
  const oracle = await ethers.getContract<OracleAggregator>('OracleAggregator');
  const setOracleTx = await hub.populateTransaction.setOracle(oracle.address);
  const salt = '';
  console.log('Current oracle:', await hub.oracle());
  console.log('Executing migration to oracle:', oracle.address);
  // Doc.: https://docs.openzeppelin.com/contracts/4.x/api/governance#TimelockController
  // Ref.: https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/governance/TimelockController.sol
  await timelock.execute(
    hub.address, // Target
    0, // Value
    setOracleTx.data, // Transaciton data
    constants.HashZero, // Predecessor
    salt, // Salt
    moment.duration('3', 'days').as('seconds') // Min delay
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
