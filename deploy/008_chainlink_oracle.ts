import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, governor } = await hre.getNamedAccounts();

  const FEED_REGISTRY_ADDRESS = '0x47Fb2585D2C56Fe188D0E6ec628a38b74fCeeeDf';
  const WETH_ADDRESS = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';

  await hre.deployments.deploy('ChainlinkOracle', {
    contract: 'contracts/oracles/ChainlinkOracle.sol:ChainlinkOracle',
    from: deployer,
    args: [WETH_ADDRESS, FEED_REGISTRY_ADDRESS, governor],
    log: true,
  });
};

deployFunction.tags = ['ChainlinkOracle'];
deployFunction.dependencies = ['TokenDescriptor'];
export default deployFunction;
