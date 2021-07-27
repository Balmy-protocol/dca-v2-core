import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, governor } = await hre.getNamedAccounts();

  const UNISWAP_V3_SWAP_ROUTER_ADDRESS = '0xE592427A0AEce92De3Edee1F18E0157C05861564';
  const UNISWAP_V3_QUOTER_ADDRESS = '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6';

  await hre.deployments.deploy('Swapper', {
    contract: 'contracts/DCASwapper/DCASwapper.sol:DCASwapper',
    from: deployer,
    args: [governor, UNISWAP_V3_SWAP_ROUTER_ADDRESS, UNISWAP_V3_QUOTER_ADDRESS],
    log: true,
  });
};
deployFunction.tags = ['Swapper'];
export default deployFunction;
