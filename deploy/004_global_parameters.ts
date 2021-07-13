import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import moment from 'moment';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, governor, feeRecipient } = await hre.getNamedAccounts();

  const uniswapOracle = await hre.deployments.get('UniswapOracle');
  const nftDescriptor = await hre.deployments.get('TokenDescriptor');
  const timelock = await hre.deployments.get('Timelock');

  await hre.deployments.deploy('GlobalParameters', {
    contract: 'contracts/DCAGlobalParameters/DCAGlobalParameters.sol:DCAGlobalParameters',
    from: deployer,
    args: [governor, timelock.address, feeRecipient, nftDescriptor.address, uniswapOracle.address],
    log: true,
  });

  await hre.deployments.execute(
    'GlobalParameters',
    { from: governor, gasLimit: 2000000 },
    'addSwapIntervalsToAllowedList',
    [moment.duration('1', 'days').as('seconds'), moment.duration('1', 'weeks').as('seconds'), moment.duration('1', 'months').as('seconds')],
    ['daily', 'weekly', 'monthly']
  );
};
export default deployFunction;
deployFunction.tags = ['GlobalParameters'];
deployFunction.dependencies = ['Timelock', 'TokenDescriptor', 'UniswapOracle'];
