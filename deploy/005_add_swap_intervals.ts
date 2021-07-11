import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import moment from 'moment';
import { network } from 'hardhat';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { governor } = await hre.getNamedAccounts();
  await hre.deployments.execute(
    'GlobalParameters',
    { from: governor, gasLimit: 200000 },
    'addSwapIntervalsToAllowedList',
    [moment.duration('1', 'days').as('seconds'), moment.duration('5', 'minutes').as('seconds')],
    ['daily', '5 minutes']
  );
};
export default deployFunction;
deployFunction.tags = ['AddBasicSwapInterval'];
deployFunction.dependencies = ['GlobalParameters'];
deployFunction.runAtTheEnd = true;
