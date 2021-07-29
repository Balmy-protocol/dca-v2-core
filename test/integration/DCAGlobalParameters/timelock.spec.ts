import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { JsonRpcSigner } from '@ethersproject/providers';
import { BigNumber, Contract, utils } from 'ethers';
import { deployments, ethers, getNamedAccounts } from 'hardhat';
import { getNodeUrl } from '../../../utils/network';
import { bn, constants, evm, wallet } from '../../utils';
import { contract, given, then, when } from '../../utils/bdd';
import moment from 'moment';
import { expect } from 'chai';

// function genOperation (target: string[], value: BigNumber[], data: string, predecessor: BigNumber, salt: string) {
//   const id = web3.utils.keccak256(web3.eth.abi.encodeParameters([
//     'address',
//     'uint256',
//     'bytes',
//     'uint256',
//     'bytes32',
//   ], [
//     target,
//     value,
//     data,
//     predecessor,
//     salt,
//   ]));
//   return { id, target, value, data, predecessor, salt };
// }

// We set a fixed block number so tests can cache blockchain state
const FORK_BLOCK_NUMBER = 12851228;

contract('DCAGlobalParameters', () => {
  let governor: JsonRpcSigner;

  let timelock: Contract;

  let target: string;
  const value = 0;
  const PREDECESSOR = constants.ZERO_BYTES32;

  beforeEach(async () => {
    await evm.reset({
      jsonRpcUrl: getNodeUrl('mainnet'),
      blockNumber: FORK_BLOCK_NUMBER,
    });

    await deployments.fixture(['GlobalParameters']);

    const namedAccounts = await getNamedAccounts();
    const governorAddress = namedAccounts.governor;
    governor = await wallet.impersonate(governorAddress);
  });

  describe('setOracle', () => {
    when('executing before delay', () => {
      then('tx is reverted');
    });
    when('executing after delay', () => {
      then('oracle gets set');
    });
  });

  describe('setSwapFee', () => {
    when('executing before delay', () => {
      then('tx is reverted');
    });
    when('executing after delay', () => {
      then('swap fee gets set');
    });
  });

  describe('setLoanFee', () => {
    when('executing before delay', () => {
      then('tx is reverted');
    });
    when('executing after delay', () => {
      then('loan fee gets set');
    });
  });
});
