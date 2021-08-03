import { deployments } from 'hardhat';
import { run } from 'hardhat';

async function main() {
  console.time('Verifying token descriptor ...');
  const tokenDescriptor = await deployments.getOrNull('TokenDescriptor');
  await run('verify:verify', {
    address: tokenDescriptor!.address,
    constructorArguments: tokenDescriptor!.args,
    contract: 'contracts/DCATokenDescriptor/DCATokenDescriptor.sol:DCATokenDescriptor',
  });
  console.timeEnd('Verifying token descriptor ...');

  console.time('Verifying uniswap oracle ...');
  const uniswapOracle = await deployments.getOrNull('UniswapOracle');
  await run('verify:verify', {
    address: uniswapOracle!.address,
    constructorArguments: uniswapOracle!.args,
    contract: 'contracts/UniswapV3Oracle/UniswapV3Oracle.sol:UniswapV3Oracle',
  });
  console.timeEnd('Verifying uniswap oracle ...');

  console.time('Verifying global parameters ...');
  const globalParameters = await deployments.getOrNull('GlobalParameters');
  await run('verify:verify', {
    address: globalParameters!.address,
    constructorArguments: globalParameters!.args,
    contract: 'contracts/DCAGlobalParameters/DCAGlobalParameters.sol:DCAGlobalParameters',
  });
  console.timeEnd('Verifying global parameters ...');

  console.time('Verifying factory ...');
  const factory = await deployments.getOrNull('Factory');
  await run('verify:verify', {
    address: factory!.address,
    constructorArguments: factory!.args,
    contract: 'contracts/DCAFactory/DCAFactory.sol:DCAFactory',
  });
  console.timeEnd('Verifying factory ...');

  console.time('Verifying dca uniswap v3 swapper ...');
  const swapper = await deployments.getOrNull('DCAUniswapV3Swapper');
  await run('verify:verify', {
    address: swapper!.address,
    constructorArguments: swapper!.args,
    contract: 'contracts/DCASwapper/DCAUniswapV3Swapper.sol:DCAUniswapV3Swapper',
  });
  console.timeEnd('Verifying dca uniswap v3 swapper ...');

  console.time('Verifying keep3r job ...');
  const keep3rJob = await deployments.getOrNull('Keep3rJob');
  await run('verify:verify', {
    address: keep3rJob!.address,
    constructorArguments: keep3rJob!.args,
    contract: 'contracts/DCAKeep3rJob/DCAKeep3rJob.sol:DCAKeep3rJob',
  });
  console.timeEnd('Verifying keep3r job ...');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
