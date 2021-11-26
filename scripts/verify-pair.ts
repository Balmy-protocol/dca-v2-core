import { DCAHub } from '@typechained';
import { abi } from '@artifacts/contracts/DCAHub/DCAHub.sol/DCAHub.json';
import { ethers, deployments } from 'hardhat';
import { run } from 'hardhat';
import evm from '@test-utils/evm';
import { getNodeUrl } from '@utils/network';

async function main() {
  const hub: DCAHub = await ethers.getContractAt<DCAHub>(abi, '0x00A882bD48377309d1DfA59bf49E60729f04c9DF');
  await evm.reset({
    jsonRpcUrl: getNodeUrl('kovan'),
    blockNumber: 28541527,
  });
  console.log('block 28541527');
  console.log('position 1', (await hub.userPosition(1)).swapped.toString());

  await evm.reset({
    jsonRpcUrl: getNodeUrl('kovan'),
    blockNumber: 28541773,
  });
  console.log('block 28541773');
  console.log('position 1', (await hub.userPosition(1)).swapped.toString());

  await evm.reset({
    jsonRpcUrl: getNodeUrl('kovan'),
    blockNumber: 28541525,
  });
  console.log('block 28541525');
  console.log('position 1', (await hub.userPosition(1)).swapped.toString());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
