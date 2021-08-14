import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, governor } = await hre.getNamedAccounts();

  const ZRX_ADDRESS = '0xdef1c0ded9bec7f1a1670819833240f027b25eff';

  await hre.deployments.deploy('DCAZRXSwapper', {
    contract: 'contracts/DCASwapper/DCAZRXSwapper.sol:DCAZRXSwapper',
    from: deployer,
    args: [governor, ZRX_ADDRESS],
    log: true,
  });
};
deployFunction.tags = ['DCAZRXSwapper'];
export default deployFunction;
