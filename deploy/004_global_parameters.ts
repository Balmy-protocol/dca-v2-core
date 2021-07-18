import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import moment from 'moment';

export type GlobalParametersDeployFunction = DeployFunction & {
  intervals: number[];
  descriptions: string[];
};

const INTERVALS = [
  moment.duration('1', 'days').as('seconds'),
  moment.duration('1', 'weeks').as('seconds'),
  moment.duration('1', 'months').as('seconds'),
];
const DESCRIPTIONS = ['daily', 'weekly', 'monthly'];

const deployFunction: GlobalParametersDeployFunction = async function (hre: HardhatRuntimeEnvironment) {
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
    INTERVALS,
    DESCRIPTIONS
  );
};

deployFunction.intervals = INTERVALS;
deployFunction.descriptions = DESCRIPTIONS;
deployFunction.tags = ['GlobalParameters'];
deployFunction.dependencies = ['Timelock', 'TokenDescriptor', 'UniswapOracle'];
export default deployFunction;
