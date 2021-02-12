import UniswapV2FactoryContract from '@uniswap/v2-core/build/UniswapV2Factory.json';
import UniswapV2Router02Contract from '@uniswap/v2-periphery/build/UniswapV2Router02.json';
import WETHContract from '@uniswap/v2-periphery/build/WETH9.json';
import { deployContract } from 'ethereum-waffle';
import { BigNumber, Contract, ethers, Signer, utils } from 'ethers';

let WETH: Contract, uniswapV2Factory: Contract, uniswapV2Router02: Contract;

const getWETH = () => WETH;
const getUniswapV2Factory = () => uniswapV2Factory;
const getUniswapV2Router02 = () => uniswapV2Router02;

const deploy = async ({ owner }: { owner: Signer }) => {
  WETH = await deployContract(owner, WETHContract);
  uniswapV2Factory = await deployContract(owner, UniswapV2FactoryContract, [
    await owner.getAddress(),
  ]);
  uniswapV2Router02 = await deployContract(
    owner,
    UniswapV2Router02Contract,
    [uniswapV2Factory.address, WETH.address],
    { gasLimit: 9500000 }
  );
  return {
    WETH,
    uniswapV2Factory,
    uniswapV2Router02,
  };
};

const createPair = async ({
  tokenA,
  tokenB,
}: {
  tokenA: Contract;
  tokenB: Contract;
}) => {
  await uniswapV2Factory.createPair(tokenA.address, tokenB.address);
};

const addLiquidity = async ({
  owner,
  tokenA,
  amountA,
  tokenB,
  amountB,
}: {
  owner: Signer;
  tokenA: Contract;
  amountA: BigNumber;
  tokenB: Contract;
  amountB: BigNumber;
}) => {
  await tokenA.approve(uniswapV2Router02.address, amountA);
  await tokenB.approve(uniswapV2Router02.address, amountB);
  await uniswapV2Router02.addLiquidity(
    tokenA.address,
    tokenB.address,
    amountA,
    amountB,
    amountA,
    amountB,
    await owner.getAddress(),
    ethers.BigNumber.from('2').pow('256').sub('2'),
    {
      gasLimit: 9500000,
    }
  );
};

const addLiquidityETH = async ({
  owner,
  tokenA,
  tokenAmount,
  wethAmount,
}: {
  owner: Signer;
  tokenA: Contract;
  tokenAmount: BigNumber;
  wethAmount: BigNumber;
}) => {
  await tokenA.approve(uniswapV2Router02.address, tokenAmount);
  await uniswapV2Router02.addLiquidityETH(
    tokenA.address,
    tokenAmount,
    tokenAmount,
    wethAmount,
    await owner.getAddress(),
    ethers.BigNumber.from('2').pow('256').sub('2'),
    {
      gasLimit: 9500000,
      value: wethAmount,
    }
  );
};

export default {
  getWETH,
  getUniswapV2Factory,
  getUniswapV2Router02,
  deploy,
  createPair,
  addLiquidity,
  addLiquidityETH,
};
