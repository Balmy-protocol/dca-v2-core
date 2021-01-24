import UniswapV2FactoryContract from '@uniswap/v2-core/build/UniswapV2Factory.json';
import UniswapV2Router02Contract from '@uniswap/v2-periphery/build/UniswapV2Router02.json';
import WETHContract from '@uniswap/v2-periphery/build/WETH9.json';
import { deployContract } from 'ethereum-waffle';
import { Contract, Signer, utils } from 'ethers';

let WETH: Contract, uniswapV2Factory: Contract, uniswapV2Router02: Contract;

const getWETH = () => WETH;
const getUniswapV2Factory = () => uniswapV2Factory;
const getUniswapV2Router02 = () => uniswapV2Router02;

const deploy = async ({ owner }: { owner: Signer}) => {
  WETH = await deployContract(owner, WETHContract);
  uniswapV2Factory = await deployContract(
    owner, 
    UniswapV2FactoryContract, 
    [await owner.getAddress()]
  );
  uniswapV2Router02 = await deployContract(
    owner, 
    UniswapV2Router02Contract, 
    [uniswapV2Factory.address, WETH.address], 
    { gasLimit: 9500000 }
  );
  return {
    WETH,
    uniswapV2Factory,
    uniswapV2Router02
  }
}

const createPair = async (erc20: Contract) => {
  await uniswapV2Factory.createPair(WETH.address, erc20.address);
}

const addLiquidityETH = async ({ owner, tokenA }: { owner: Signer, tokenA: Contract }) => {
  // TODO: Research parameters
  const tokenAmount = utils.parseEther('200000');
  const wethAmount = utils.parseEther('1000');
  const maxUint = utils.parseEther('99999999');
  await tokenA.approve(uniswapV2Router02.address, maxUint);
  // WETH/HEGIC pair
  await uniswapV2Router02.addLiquidityETH(
    tokenA.address, 
    tokenAmount, 
    tokenAmount, 
    wethAmount, 
    await owner.getAddress(), 
    maxUint, 
    {
      gasLimit: 9500000,
      value: wethAmount
    }
  );
}

export default {
  getWETH,
  getUniswapV2Factory,
  getUniswapV2Router02,
  deploy,
  createPair,
  addLiquidityETH
}
