import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { JsonRpcSigner, TransactionResponse } from '@ethersproject/providers';
import { BigNumber, Contract, utils } from 'ethers';
import { deployments, ethers, getNamedAccounts } from 'hardhat';
import { abi as IERC20_ABI } from '@openzeppelin/contracts/build/contracts/IERC20.json';
import { abi as SWAP_ROUTER_ABI } from '@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json';
import { getNodeUrl } from '../../../utils/network';
import { evm, wallet } from '../../utils';
import { contract, given, then, when } from '../../utils/bdd';
import globalParametersDeployFunction from '../../../deploy/004_global_parameters';
import moment from 'moment';
import { expect } from 'chai';
import { pack } from '@ethersproject/solidity';

const WETH_ADDRESS = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const WETH_WHALE_ADDRESS = '0xf04a5cc80b1e94c69b48f5ee68a08cd2f09a7c3e';
const USDC_ADDRESS = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const USDC_WHALE_ADDRESS = '0x0a59649758aa4d66e25f08dd01271e891fe52199';
const KEEP3R_GOVERNANCE_ADDRESS = '0x0D5Dc686d0a2ABBfDaFDFb4D0533E886517d4E83';
const KEEPER_ADDRESS = '0x9f6fdc2565cfc9ab8e184753bafc8e94c0f985a0';

// We set a fixed block number so tests can cache blockchain state
const FORK_BLOCK_NUMBER = 12851228;

const KEEP3R_V1 = '0x1ceb5cb57c4d4e2b2433641b95dd330a33185a44';
const UNISWAP_SWAP_ROUTER_ADDRESS = '0xE592427A0AEce92De3Edee1F18E0157C05861564';

contract('DCAKeep3rJob', () => {
  let DCASwapper: Contract;
  let DCAFactory: Contract;
  let DCAPair: Contract;
  let WETH: Contract;
  let USDC: Contract;
  let DCAKeep3rJob: Contract;
  let keep3rV1: Contract;

  let uniswapSwapRouter: Contract;

  let governor: JsonRpcSigner;
  let wethWhale: JsonRpcSigner;
  let usdcWhale: JsonRpcSigner;
  let keep3rGovernance: JsonRpcSigner;
  let keeper: JsonRpcSigner;
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

    await deployments.fixture(['Factory', 'Swapper', 'Keep3rJob']);

    const namedAccounts = await getNamedAccounts();
    feeRecipient = namedAccounts.feeRecipient;
    const governorAddress = namedAccounts.governor;
    governor = await wallet.impersonate(governorAddress);

    DCASwapper = await ethers.getContract('Swapper', governor);
    DCAFactory = await ethers.getContract('Factory');
    DCAKeep3rJob = await ethers.getContract('Keep3rJob');
    keep3rV1 = await ethers.getContractAt('contracts/interfaces/IKeep3rV1.sol:IKeep3rV1', KEEP3R_V1);

    keep3rGovernance = await wallet.impersonate(KEEP3R_GOVERNANCE_ADDRESS);
    keeper = await wallet.impersonate(KEEPER_ADDRESS);

    const pairAddress = await DCAFactory.callStatic.createPair(WETH_ADDRESS, USDC_ADDRESS);
    await DCAFactory.createPair(WETH_ADDRESS, USDC_ADDRESS);
    DCAPair = await ethers.getContractAt('contracts/DCAPair/DCAPair.sol:DCAPair', pairAddress);

    WETH = await ethers.getContractAt(IERC20_ABI, WETH_ADDRESS);
    USDC = await ethers.getContractAt(IERC20_ABI, USDC_ADDRESS);
    wethWhale = await wallet.impersonate(WETH_WHALE_ADDRESS);
    usdcWhale = await wallet.impersonate(USDC_WHALE_ADDRESS);

    await WETH.connect(wethWhale).transfer(cindy.address, utils.parseEther('100000'), { gasPrice: 0 });
    await WETH.connect(cindy).approve(DCAPair.address, RATE.mul(AMOUNT_OF_SWAPS));
    await DCAPair.connect(cindy).deposit(WETH.address, RATE, AMOUNT_OF_SWAPS, INTERVAL);

    await DCAKeep3rJob.connect(governor).startSubsidizingPairs([DCAPair.address], { gasPrice: 0 });
    await keep3rV1.connect(keep3rGovernance).addJob(DCAKeep3rJob.address, { gasPrice: 0 });

    await pushPriceOfWETHUp();
  });

  describe('work', () => {
    when("job doesn't have credits", () => {
      let workTx: Promise<TransactionResponse>;
      given(async () => {
        const parameters = await DCAKeep3rJob.callStatic.workable();
        workTx = DCAKeep3rJob.connect(keeper).work(...parameters);
      });
      then('tx is reverted with reason', async () => {
        await expect(workTx).to.be.revertedWith('workReceipt: insuffient funds');
      });
    });

    when('job has credits and is worked by a keeper', () => {
      let initialBonds: BigNumber;
      const initialCredits = utils.parseEther('10');
      let workTx: TransactionResponse;
      given(async () => {
        await keep3rV1.connect(keep3rGovernance).addKPRCredit(DCAKeep3rJob.address, initialCredits, { gasPrice: 0 });
        initialBonds = await keep3rV1.bonds(KEEPER_ADDRESS, KEEP3R_V1);
        const parameters = await DCAKeep3rJob.callStatic.workable();
        workTx = await DCAKeep3rJob.connect(keeper).work(...parameters);
      });
      then('credits of job get reduced', async () => {
        expect(await keep3rV1.credits(DCAKeep3rJob.address, KEEP3R_V1)).to.be.lt(initialCredits);
      });
      then('credits get added to keeper', async () => {
        expect(await keep3rV1.bonds(KEEPER_ADDRESS, KEEP3R_V1)).to.be.gt(initialBonds);
      });
      then('pair gets swapped', async () => {
        await expect(workTx).to.emit(DCAPair, 'Swapped');
      });
      then('job gets worked', async () => {
        await expect(workTx).to.emit(DCAKeep3rJob, 'Worked').withArgs(1);
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
});
