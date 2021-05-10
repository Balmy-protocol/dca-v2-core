import { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import chai from 'chai';
import { Contract, ContractFactory, ContractInterface, Signer, Wallet } from 'ethers';
import { TransactionRequest, TransactionResponse } from '@ethersproject/abstract-provider';
import { getStatic } from 'ethers/lib/utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { given, then, when } from './bdd';
import { wallet } from '.';

chai.use(chaiAsPromised);

const checkTxRevertedWithMessage = async ({ tx, message }: { tx: Promise<TransactionRequest>; message: RegExp | string }): Promise<void> => {
  await expect(tx).to.be.reverted;
  if (message instanceof RegExp) {
    await expect(tx).eventually.rejected.have.property('message').match(message);
  } else {
    await expect(tx).to.be.revertedWith(message);
  }
};

const checkTxRevertedWithZeroAddress = async (tx: Promise<TransactionRequest>): Promise<void> => {
  await checkTxRevertedWithMessage({
    tx,
    message: /zero address/,
  });
};

const deployShouldRevertWithZeroAddress = async ({ contract, args }: { contract: ContractFactory; args: any[] }): Promise<void> => {
  const deployContractTx = await contract.getDeployTransaction(...args);
  const tx = contract.signer.sendTransaction(deployContractTx);
  await checkTxRevertedWithZeroAddress(tx);
};

const deployShouldRevertWithMessage = async ({
  contract,
  args,
  message,
}: {
  contract: ContractFactory;
  args: any[];
  message: string;
}): Promise<void> => {
  const deployContractTx = await contract.getDeployTransaction(...args);
  const tx = contract.signer.sendTransaction(deployContractTx);
  await checkTxRevertedWithMessage({ tx, message });
};

const txShouldRevertWithZeroAddress = async ({
  contract,
  func,
  args,
}: {
  contract: Contract;
  func: string;
  args: any[];
  tx?: Promise<TransactionRequest>;
}): Promise<void> => {
  const tx = contract[func].apply(this, args);
  await checkTxRevertedWithZeroAddress(tx);
};

const txShouldRevertWithMessage = async ({
  contract,
  func,
  args,
  message,
}: {
  contract: Contract;
  func: string;
  args: any[];
  message: string;
}): Promise<void> => {
  const tx = contract[func].apply(this, args);
  await checkTxRevertedWithMessage({ tx, message });
};

const checkTxEmittedEvents = async ({
  contract,
  tx,
  events,
}: {
  contract: Contract;
  tx: Promise<TransactionRequest>;
  events: { name: string; args: any[] }[];
}): Promise<void> => {
  for (let i = 0; i < events.length; i++) {
    await expect(tx)
      .to.emit(contract, events[i].name)
      .withArgs(...events[i].args);
  }
};

const deployShouldSetVariablesAndEmitEvents = async ({
  contract,
  args,
  settersGettersVariablesAndEvents,
}: {
  contract: ContractFactory;
  args: any[];
  settersGettersVariablesAndEvents: {
    getterFunc: string;
    variable: any;
    eventEmitted: string;
  }[];
}): Promise<void> => {
  const deployContractTx = await contract.getDeployTransaction(...args);
  const tx = contract.signer.sendTransaction(deployContractTx);
  const address = getStatic<(tx: TransactionResponse) => string>(contract.constructor, 'getContractAddress')(await tx);
  const deployedContract = getStatic<(address: string, contractInterface: ContractInterface, signer?: Signer) => Contract>(
    contract.constructor,
    'getContract'
  )(address, contract.interface, contract.signer);
  await txShouldHaveSetVariablesAndEmitEvents({
    contract: deployedContract,
    tx,
    settersGettersVariablesAndEvents,
  });
};

const txShouldHaveSetVariablesAndEmitEvents = async ({
  contract,
  tx,
  settersGettersVariablesAndEvents,
}: {
  contract: Contract;
  tx: Promise<TransactionRequest>;
  settersGettersVariablesAndEvents: {
    getterFunc: string;
    variable: any;
    eventEmitted: string;
  }[];
}): Promise<void> => {
  for (let i = 0; i < settersGettersVariablesAndEvents.length; i++) {
    await checkTxEmittedEvents({
      contract,
      tx,
      events: [
        {
          name: settersGettersVariablesAndEvents[i].eventEmitted,
          args: [settersGettersVariablesAndEvents[i].variable],
        },
      ],
    });
    expect(await contract[settersGettersVariablesAndEvents[i].getterFunc].apply(this)).to.eq(settersGettersVariablesAndEvents[i].variable);
  }
};

const txShouldSetVariableAndEmitEvent = async ({
  contract,
  setterFunc,
  getterFunc,
  variable,
  eventEmitted,
}: {
  contract: Contract;
  setterFunc: string;
  getterFunc: string;
  variable: any;
  eventEmitted: string;
}): Promise<void> => {
  expect(await contract[getterFunc].apply(this)).to.not.eq(variable);
  const tx = contract[setterFunc].apply(this, [variable]);
  await txShouldHaveSetVariablesAndEmitEvents({
    contract,
    tx,
    settersGettersVariablesAndEvents: [
      {
        getterFunc,
        variable,
        eventEmitted,
      },
    ],
  });
};

const shouldBeExecutableOnlyByGovernor = ({
  contract,
  funcAndSignature,
  params,
  governor,
}: {
  contract: () => Contract;
  funcAndSignature: string;
  params?: any[];
  governor: () => SignerWithAddress | Wallet;
}) => {
  params = params ?? [];
  when('not called from governor', () => {
    let onlyGovernorAllowedTx: Promise<TransactionResponse>;
    given(async () => {
      const notGovernor = await wallet.generateRandom();
      onlyGovernorAllowedTx = contract()
        .connect(notGovernor)
        [funcAndSignature](...params!, { gasPrice: 0 });
    });
    then('tx is reverted with reason', async () => {
      await expect(onlyGovernorAllowedTx).to.be.revertedWith('Governable: only governor');
    });
  });
  when('called from governor', () => {
    let onlyGovernorAllowedTx: Promise<TransactionResponse>;
    given(async () => {
      onlyGovernorAllowedTx = contract()
        .connect(governor())
        [funcAndSignature](...params!, { gasPrice: 0 });
    });
    then('tx is not reverted or not reverted with reason only governor', async () => {
      await expect(onlyGovernorAllowedTx).to.not.be.revertedWith('Governable: only governor');
    });
  });
};

const shouldBeExecutableOnlyByPendingGovernor = ({
  contract,
  funcAndSignature,
  params,
  governor,
}: {
  contract: () => Contract;
  funcAndSignature: string;
  params?: any[];
  governor: () => SignerWithAddress | Wallet;
}) => {
  params = params ?? [];
  when('not called from pending governor', () => {
    let onlyPendingGovernorAllowedTx: Promise<TransactionResponse>;
    given(async () => {
      const notPendingGovernor = await wallet.generateRandom();
      onlyPendingGovernorAllowedTx = contract()
        .connect(notPendingGovernor)
        [funcAndSignature](...params!, { gasPrice: 0 });
    });
    then('tx is reverted with reason', async () => {
      await expect(onlyPendingGovernorAllowedTx).to.be.revertedWith('Governable: only pending governor');
    });
  });
  when('called from pending governor', () => {
    let onlyPendingGovernorAllowedTx: Promise<TransactionResponse>;
    given(async () => {
      const pendingGovernor = await wallet.generateRandom();
      await contract().connect(governor()).setPendingGovernor(pendingGovernor.address);
      onlyPendingGovernorAllowedTx = contract()
        .connect(pendingGovernor)
        [funcAndSignature](...params!, { gasPrice: 0 });
    });
    then('tx is not reverted or not reverted with reason only pending governor', async () => {
      await expect(onlyPendingGovernorAllowedTx).to.not.be.revertedWith('Governable: only pending governor');
    });
  });
};

const waitForTxAndNotThrow = (tx: Promise<TransactionRequest>): Promise<any> => {
  return new Promise((resolve) => {
    tx.then(resolve).catch(resolve);
  });
};

export default {
  deployShouldRevertWithMessage,
  deployShouldRevertWithZeroAddress,
  txShouldRevertWithZeroAddress,
  txShouldRevertWithMessage,
  deployShouldSetVariablesAndEmitEvents,
  txShouldHaveSetVariablesAndEmitEvents,
  txShouldSetVariableAndEmitEvent,
  checkTxRevertedWithMessage,
  waitForTxAndNotThrow,
  shouldBeExecutableOnlyByGovernor,
  shouldBeExecutableOnlyByPendingGovernor,
};
