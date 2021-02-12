import { BigNumber, Contract } from 'ethers';
import { ethers } from 'hardhat';

const deploy = async ({
  name,
  symbol,
  initialAccount,
  initialAmount,
}: {
  name: string;
  symbol: string;
  initialAccount: string;
  initialAmount: BigNumber;
}): Promise<Contract> => {
  const erc20MockContract = await ethers.getContractFactory(
    'contracts/mocks/ERC20Mock.sol:ERC20Mock'
  );
  const deployedContract = await erc20MockContract.deploy(
    name,
    symbol,
    initialAccount,
    initialAmount
  );
  return deployedContract;
};

export default {
  deploy,
};
