import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { JsonRpcSigner } from '@ethersproject/providers';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { BigNumber, Contract, utils } from 'ethers';
import { deployments, ethers, getNamedAccounts } from 'hardhat';
import { abi as IERC20_ABI } from '@openzeppelin/contracts/build/contracts/IERC20.json';
import { abi as SWAP_ROUTER_ABI } from '@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json';
import { abi as QUOTER_ABI } from '@uniswap/v3-periphery/artifacts/contracts/lens/Quoter.sol/Quoter.json';
import { getNodeUrl } from '../../../utils/network';
import { bn, constants, evm, wallet } from '../../utils';
import { contract, given, then, when } from '../../utils/bdd';
import globalParametersDeployFunction from '../../../deploy/004_global_parameters';
import moment from 'moment';
import { expect } from 'chai';
import { pack } from '@ethersproject/solidity';

const WETH_ADDRESS = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const WETH_WHALE_ADDRESS = '0xf04a5cc80b1e94c69b48f5ee68a08cd2f09a7c3e';
const USDC_ADDRESS = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const USDC_WHALE_ADDRESS = '0x0a59649758aa4d66e25f08dd01271e891fe52199';

// We set a fixed block number so tests can cache blockchain state
const FORK_BLOCK_NUMBER = 12851228;

const UNISWAP_SWAP_ROUTER_ADDRESS = '0xE592427A0AEce92De3Edee1F18E0157C05861564';

const CALCULATE_FEE = (bn: BigNumber) => bn.mul(3).div(1000);
const APPLY_FEE = (bn: BigNumber) => bn.sub(CALCULATE_FEE(bn));

contract('DCASwapper', () => {
  let DCASwapper: Contract;
  let DCAFactory: Contract;
  let DCAPair: Contract;
  let WETH: Contract;
  let USDC: Contract;
  let oracle: Contract;

  let uniswapSwapRouter: Contract;

  let governor: JsonRpcSigner;
  let wethWhale: JsonRpcSigner;
  let usdcWhale: JsonRpcSigner;
  let cindy: SignerWithAddress;
  let alice: SignerWithAddress;
  let feeRecipient: string;

  const RATE = utils.parseEther('0.1');
  const AMOUNT_OF_SWAPS = 10;
  const INTERVAL = globalParametersDeployFunction.intervals[0];

  before(async () => {
    [cindy, alice] = await ethers.getSigners();
  });

  beforeEach(async () => {
    await evm.reset({
      jsonRpcUrl: getNodeUrl('mainnet'),
      blockNumber: FORK_BLOCK_NUMBER,
    });

    uniswapSwapRouter = await ethers.getContractAt(SWAP_ROUTER_ABI, UNISWAP_SWAP_ROUTER_ADDRESS);

    await deployments.fixture('Swapper');

    const namedAccounts = await getNamedAccounts();
    feeRecipient = namedAccounts.feeRecipient;
    const governorAddress = namedAccounts.governor;
    governor = await wallet.impersonate(governorAddress);

    DCASwapper = await ethers.getContract('Swapper', governor);
    DCAFactory = await ethers.getContract('Factory');
    oracle = await ethers.getContract('UniswapOracle');

    const pairAddress = await DCAFactory.callStatic.createPair(WETH_ADDRESS, USDC_ADDRESS);
    await DCAFactory.createPair(WETH_ADDRESS, USDC_ADDRESS);
    DCAPair = await ethers.getContractAt('contracts/DCAPair/DCAPair.sol:DCAPair', pairAddress);

    WETH = await ethers.getContractAt(IERC20_ABI, WETH_ADDRESS);
    USDC = await ethers.getContractAt(IERC20_ABI, USDC_ADDRESS);
    wethWhale = await wallet.impersonate(WETH_WHALE_ADDRESS);
    usdcWhale = await wallet.impersonate(USDC_WHALE_ADDRESS);

    await WETH.connect(wethWhale).transfer(cindy.address, utils.parseEther('100000'), { gasPrice: 0 });
    await USDC.connect(usdcWhale).transfer(alice.address, utils.parseUnits('100000', 6), { gasPrice: 0 });

    await WETH.connect(cindy).approve(DCAPair.address, RATE.mul(AMOUNT_OF_SWAPS));
    await DCAPair.connect(cindy).deposit(WETH.address, RATE, AMOUNT_OF_SWAPS, INTERVAL);
  });

  describe('swap', () => {
    given(async () => {
      await DCASwapper.startWatchingPairs([DCAPair.address]);
    });

    when('pair doesnt need external liquidity', () => {
      let usdcNeeded: BigNumber;
      given(async () => {
        usdcNeeded = await oracle.quote(WETH.address, RATE, USDC.address);
        await USDC.connect(alice).approve(DCAPair.address, usdcNeeded);
        await DCAPair.connect(alice).deposit(USDC.address, usdcNeeded, 1, INTERVAL);
        await DCASwapper.swapPairs([DCAPair.address]);
      });
      then('swap is executed', async () => {
        expect(await DCAPair.performedSwaps(INTERVAL)).to.equal(1);
      });
      then('fee is sent', async () => {
        expect(await USDC.balanceOf(feeRecipient)).to.equal(CALCULATE_FEE(usdcNeeded));
        expect(await WETH.balanceOf(feeRecipient)).to.equal(CALCULATE_FEE(RATE));
      });
    });

    when(`twap doesn't allow for profitable swap`, () => {
      given(async () => {
        await pushPriceOfWETHDown();
      });
      then('get pairs to swap returns empty', async () => {
        const pairs = await DCASwapper.callStatic.getPairsToSwap();

        expect(pairs).to.be.empty;
      });
      then('swap gets reverted', async () => {
        const swapPairsTx = DCASwapper.connect(governor).swapPairs([DCAPair.address], { gasPrice: 0 });
        await expect(swapPairsTx).to.be.reverted;
      });
    });

    when('twap price < uni price => allows for profitable swap', () => {
      let twapPrice: BigNumber;
      let currentUniswapPrice: BigNumber;
      let amountOfETHNeededToGetUSDC: BigNumber;
      given(async () => {
        currentUniswapPrice = await pushPriceOfWETHUp();
        twapPrice = await oracle.quote(WETH.address, RATE, USDC.address);
        expect(twapPrice).to.be.lt(currentUniswapPrice, 'Didnt push the price of WETH up enough');
        await WETH.connect(wethWhale).approve(uniswapSwapRouter.address, constants.MAX_UINT_256, { gasPrice: 0 });
        // This is approx since our call static is made in block T-1 and swap uses block T, so using quote is not accurate.
        // That is why also amountOut is hardcoded, and we are not using twapPrice
        amountOfETHNeededToGetUSDC = await uniswapSwapRouter.connect(wethWhale).callStatic.exactOutputSingle(
          {
            tokenIn: WETH_ADDRESS,
            tokenOut: USDC_ADDRESS,
            fee: 3000,
            recipient: wallet.generateRandomAddress(),
            deadline: moment().unix(),
            amountOut: '190992690',
            amountInMaximum: RATE,
            sqrtPriceLimitX96: 0,
          },
          { gasPrice: 0 }
        );
      });
      then('pair can be swapped', async () => {
        const pairs = await DCASwapper.callStatic.getPairsToSwap({ gasPrice: 0 });
        expect(pairs).to.eql([DCAPair.address]);
      });
      describe('swap', () => {
        given(async () => {
          await DCASwapper.connect(governor).swapPairs([DCAPair.address], { gasPrice: 0 });
        });
        then('swap is executed', async () => {
          expect(await DCAPair.performedSwaps(INTERVAL)).to.equal(1);
        });
        then('pair balance is correct', async () => {
          expect(await WETH.balanceOf(DCAPair.address)).to.equal(RATE.mul(AMOUNT_OF_SWAPS - 1));
          expect(await USDC.balanceOf(DCAPair.address)).to.be.gte(APPLY_FEE(twapPrice));
        });
        then('fee + change is sent to fee recipient', async () => {
          const feeToGet = RATE.sub(amountOfETHNeededToGetUSDC);
          bn.expectToEqualWithThreshold({
            value: await WETH.balanceOf(feeRecipient),
            to: feeToGet,
            threshold: feeToGet.div(100), // 1%
          });
          expect(await USDC.balanceOf(feeRecipient)).to.equal(0);
        });
      });
    });
  });

  async function pushPriceOfWETHUp(): Promise<BigNumber> {
    const buyAmount = utils.parseUnits('10000000', 6);
    const wethUpPriceParams = {
      path: pack(['address', 'uint24', 'address'], [USDC.address, 3000, WETH.address]),
      recipient: usdcWhale._address,
      deadline: moment().add('30', 'minutes').unix(),
      amountIn: buyAmount,
      amountOutMinimum: 0,
    };
    await USDC.connect(usdcWhale).approve(uniswapSwapRouter.address, buyAmount, { gasPrice: 0 });
    await uniswapSwapRouter.connect(usdcWhale).exactInput(wethUpPriceParams, { gasPrice: 0 });
    await evm.advanceBlock();
    const currentPriceParams = {
      path: pack(['address', 'uint24', 'address'], [WETH.address, 3000, USDC.address]),
      recipient: usdcWhale._address,
      deadline: moment().add('30', 'minutes').unix(),
      amountIn: utils.parseEther('1'),
      amountOutMinimum: 0,
    };
    await WETH.connect(wethWhale).approve(uniswapSwapRouter.address, utils.parseEther('1'), { gasPrice: 0 });
    const currentPrice = await uniswapSwapRouter.connect(wethWhale).callStatic.exactInput(currentPriceParams, { gasPrice: 0 });
    return currentPrice;
  }

  async function pushPriceOfWETHDown(): Promise<BigNumber> {
    const sellAmount = utils.parseEther('1000');
    const wethDownPriceParams = {
      path: pack(['address', 'uint24', 'address'], [WETH.address, 3000, USDC.address]),
      recipient: wethWhale._address,
      deadline: moment().add('30', 'minutes').unix(),
      amountIn: sellAmount,
      amountOutMinimum: 0,
    };
    await WETH.connect(wethWhale).approve(uniswapSwapRouter.address, sellAmount, { gasPrice: 0 });
    await uniswapSwapRouter.connect(wethWhale).exactInput(wethDownPriceParams, { gasPrice: 0 });
    await evm.advanceBlock();
    const currentPriceParams = {
      path: pack(['address', 'uint24', 'address'], [WETH.address, 3000, USDC.address]),
      recipient: usdcWhale._address,
      deadline: moment().add('30', 'minutes').unix(),
      amountIn: utils.parseEther('1'),
      amountOutMinimum: 0,
    };
    await WETH.connect(wethWhale).approve(uniswapSwapRouter.address, utils.parseEther('1'), { gasPrice: 0 });
    const currentPrice = await uniswapSwapRouter.connect(wethWhale).callStatic.exactInput(currentPriceParams, { gasPrice: 0 });
    return currentPrice;
  }
});
