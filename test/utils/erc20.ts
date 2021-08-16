import { BigNumber, Contract, utils, constants } from 'ethers';
import { ethers } from 'hardhat';

const deploy = async ({
  name,
  symbol,
  decimals,
  initialAccount,
  initialAmount,
}: {
  name: string;
  symbol: string;
  decimals?: BigNumber | number;
  initialAccount?: string;
  initialAmount?: BigNumber | number;
}): Promise<TokenContract> => {
  const erc20MockContract = await ethers.getContractFactory('contracts/mocks/ERC20Mock.sol:ERC20Mock');
  const deployedContract = await erc20MockContract.deploy(
    name,
    symbol,
    decimals || 18,
    initialAccount ?? constants.AddressZero,
    BigNumber.isBigNumber(initialAmount) ? initialAmount : utils.parseUnits(`${initialAmount ?? 0}`, decimals || 18)
  );
  return addExtra(deployedContract);
};

async function addExtra(tokenContract: Contract): Promise<TokenContract> {
  const decimals = await tokenContract.decimals();
  // @ts-ignore
  tokenContract.asUnits = (toParse: string | number) => utils.parseUnits(`${toParse}`, decimals);
  // @ts-ignore
  tokenContract.amountOfDecimals = decimals;
  // @ts-ignore
  tokenContract.magnitude = BigNumber.from(10).pow(decimals);
  // @ts-ignore
  return tokenContract;
}

export type TokenContract = Contract & {
  asUnits: (toParse: string | number) => BigNumber;
  amountOfDecimals: number;
  magnitude: BigNumber;
};

export default {
  deploy,
};
