import { Contract, utils } from 'ethers';
import { ethers } from 'hardhat';

let oracle: Contract;
let uniswapFactory: Contract;
const uniswapFactoryAddress = '0x1F98431c8aD98523631AE4a59f267346ea31F984';

const logPool = async (token0: string, token1: string) => {
  const fees = [500, 3000, 10000];
  const tokenA = await ethers.getContractAt('ERC20', token0);
  const tokenB = await ethers.getContractAt('ERC20', token1);
  const symbolA = await tokenA.symbol();
  const symbolB = await tokenB.symbol();
  const decimalsA = await tokenA.decimals();
  const decimalsB = await tokenB.decimals();
  for (let i = 0; i < fees.length; i++) {
    console.log(`Pool (${symbolA} - ${symbolB})`);
    console.log('fee:', fees[i]);
    const pool = await uniswapFactory.getPool(token0, token1, fees[i]);
    if (pool == '0x0000000000000000000000000000000000000000') {
      console.log('address:', '0x0000000000000000000000000000000000000000');
      continue;
    }
    console.log('address:', pool);
    console.log(`${symbolA} balance:`, utils.formatUnits(await tokenA.balanceOf(pool), decimalsA));
    console.log(`${symbolB} balance:`, utils.formatUnits(await tokenB.balanceOf(pool), decimalsB));
    try {
      const formAToB = await oracle.getQuote(pool, token0, utils.parseUnits('1', decimalsA), token1, 60);
      console.log(`twap from ${symbolA} to ${symbolB}`, utils.formatUnits(formAToB));
      const formBToA = await oracle.getQuote(pool, token1, utils.parseUnits('1', decimalsB), token0, 60);
      console.log(`twap from ${symbolB} to ${symbolA}`, utils.formatUnits(formBToA));
    } catch (err) {
      console.log('twap error');
    }
    console.log('---------');
  }
};

async function main() {
  const oracleFactory = await ethers.getContractFactory('contracts/mocks/utils/Oracle.sol:OracleMock');
  oracle = await oracleFactory.deploy();
  uniswapFactory = await ethers.getContractAt('contracts/interfaces/IUniswapV3Factory.sol:IUniswapV3Factory', uniswapFactoryAddress);
  const dai = '0x6b175474e89094c44da98b954eedeac495271d0f';
  const weth = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
  const wbtc = '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599';
  await logPool(dai, weth);
  await logPool(dai, wbtc);
  await logPool(weth, wbtc);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
