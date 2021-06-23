import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import moment from 'moment';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { governor } = await hre.getNamedAccounts();
  await hre.deployments.execute(
    'GlobalParameters',
    { from: governor },
    'addSwapIntervalsToAllowedList',
    [moment.duration('1', 'days').as('seconds')],
    ['daily']
  );
};
export default deployFunction;
deployFunction.tags = ['AddBasicSwapInterval'];
deployFunction.dependencies = ['GlobalParameters'];
deployFunction.runAtTheEnd = true;
