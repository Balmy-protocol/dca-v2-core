import { utils } from 'ethers';
import { ethers, getNamedAccounts } from 'hardhat';
import wallet from '../../../test/utils/wallet';

const SEBI_TEST_ACCOUNT = '0xD04Fc1C35cd00F799d6831E33978F302FE861789';
const CHAMO_TEST_ACCOUNT = '0xE100cf9c1d7a96a7790Cb54b86658572C755aB2F';

const WBTC = '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599';
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const DAI = '0x6b175474e89094c44da98b954eedeac495271d0f';

const WBTC_WHALE = '0x9ff58f4ffb29fa2266ab25e75e2a8b3503311656';
const WETH_WHALE = '0x2f0b23f53734252bda2277357e97e1517d6b042a';
const DAI_WHALE = '0x028171bca77440897b824ca71d1c56cac55b68a3';

async function main() {
  const { deployer, governor, feeRecipient, marketMaker } = await getNamedAccounts();

  const WBTCWhale = await wallet.impersonate(WBTC_WHALE);
  const WETHWhale = await wallet.impersonate(WETH_WHALE);
  const DAIWhale = await wallet.impersonate(DAI_WHALE);

  const dai = await ethers.getContractAt('ERC20Mock', DAI, DAIWhale);
  const wbtc = await ethers.getContractAt('ERC20Mock', WBTC, WBTCWhale);
  const weth = await ethers.getContractAt('ERC20Mock', WETH, WETHWhale);

  await ethers.provider.send('hardhat_setBalance', [deployer, '0xfffffffffffffffff']);
  await ethers.provider.send('hardhat_setBalance', [governor, '0xfffffffffffffffff']);
  await ethers.provider.send('hardhat_setBalance', [feeRecipient, '0xfffffffffffffffff']);
  await ethers.provider.send('hardhat_setBalance', [marketMaker, '0xfffffffffffffffff']);
  await ethers.provider.send('hardhat_setBalance', [SEBI_TEST_ACCOUNT, '0xfffffffffffffffff']);

  await dai.transfer(deployer, utils.parseEther('10000'), { gasPrice: 0 });
  await dai.transfer(governor, utils.parseEther('10000'), { gasPrice: 0 });
  await dai.transfer(feeRecipient, utils.parseEther('10000'), { gasPrice: 0 });
  await dai.transfer(marketMaker, utils.parseEther('10000'), { gasPrice: 0 });
  await dai.transfer(SEBI_TEST_ACCOUNT, utils.parseEther('10000'), { gasPrice: 0 });
  await dai.transfer(CHAMO_TEST_ACCOUNT, utils.parseEther('10000'), { gasPrice: 0 });

  await weth.transfer(deployer, utils.parseEther('100'), { gasPrice: 0 });
  await weth.transfer(governor, utils.parseEther('100'), { gasPrice: 0 });
  await weth.transfer(feeRecipient, utils.parseEther('100'), { gasPrice: 0 });
  await weth.transfer(marketMaker, utils.parseEther('100'), { gasPrice: 0 });
  await weth.transfer(SEBI_TEST_ACCOUNT, utils.parseEther('100'), { gasPrice: 0 });
  await weth.transfer(CHAMO_TEST_ACCOUNT, utils.parseEther('100'), { gasPrice: 0 });

  await wbtc.transfer(deployer, utils.parseUnits('10', 8), { gasPrice: 0 });
  await wbtc.transfer(governor, utils.parseUnits('10', 8), { gasPrice: 0 });
  await wbtc.transfer(feeRecipient, utils.parseUnits('10', 8), { gasPrice: 0 });
  await wbtc.transfer(marketMaker, utils.parseUnits('10', 8), { gasPrice: 0 });
  await wbtc.transfer(SEBI_TEST_ACCOUNT, utils.parseUnits('10', 8), { gasPrice: 0 });
  await wbtc.transfer(CHAMO_TEST_ACCOUNT, utils.parseUnits('10', 8), { gasPrice: 0 });

  await wallet.stopImpersonating(WBTC_WHALE);
  await wallet.stopImpersonating(WETH_WHALE);
  await wallet.stopImpersonating(DAI_WHALE);

  console.log('checking balances of dai ...');
  console.log('deployer', utils.formatEther(await dai.balanceOf(deployer)), 'dai');
  console.log('governor', utils.formatEther(await dai.balanceOf(governor)), 'dai');
  console.log('fee recipient', utils.formatEther(await dai.balanceOf(feeRecipient)), 'dai');
  console.log('market maker', utils.formatEther(await dai.balanceOf(marketMaker)), 'dai');
  console.log('sebi', utils.formatEther(await dai.balanceOf(SEBI_TEST_ACCOUNT)), 'dai');
  console.log('chamo', utils.formatEther(await dai.balanceOf(CHAMO_TEST_ACCOUNT)), 'dai');

  console.log('checking balances of weth ...');
  console.log('deployer', utils.formatEther(await weth.balanceOf(deployer)), 'weth');
  console.log('governor', utils.formatEther(await weth.balanceOf(governor)), 'weth');
  console.log('fee recipient', utils.formatEther(await weth.balanceOf(feeRecipient)), 'weth');
  console.log('market maker', utils.formatEther(await weth.balanceOf(marketMaker)), 'weth');
  console.log('sebi', utils.formatEther(await weth.balanceOf(SEBI_TEST_ACCOUNT)), 'weth');
  console.log('chamo', utils.formatEther(await weth.balanceOf(CHAMO_TEST_ACCOUNT)), 'weth');

  console.log('checking balances of wbtc ...');
  console.log('deployer', utils.formatUnits(await wbtc.balanceOf(deployer), 8), 'wbtc');
  console.log('governor', utils.formatUnits(await wbtc.balanceOf(governor), 8), 'wbtc');
  console.log('fee recipient', utils.formatUnits(await wbtc.balanceOf(feeRecipient), 8), 'wbtc');
  console.log('market maker', utils.formatUnits(await wbtc.balanceOf(marketMaker), 8), 'wbtc');
  console.log('sebi', utils.formatUnits(await wbtc.balanceOf(SEBI_TEST_ACCOUNT), 8), 'wbtc');
  console.log('chamo', utils.formatUnits(await wbtc.balanceOf(CHAMO_TEST_ACCOUNT), 8), 'wbtc');
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
