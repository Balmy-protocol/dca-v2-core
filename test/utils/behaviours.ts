import { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import chai from 'chai';
import { Contract, ContractFactory, ContractInterface, Signer } from 'ethers';
import {
  TransactionRequest,
  TransactionResponse,
} from '@ethersproject/abstract-provider';
import { getStatic } from 'ethers/lib/utils';

chai.use(chaiAsPromised);

const checkTxRevertedWithMessage = async ({
  tx,
  message,
}: {
  tx: Promise<TransactionRequest>;
  message: RegExp;
}): Promise<void> => {
  await expect(tx).to.be.reverted;
  await expect(tx).eventually.rejected.have.property('message').match(message);
};

const checkTxRevertedWithZeroAddress = async (
  tx: Promise<TransactionRequest>
): Promise<void> => {
  await checkTxRevertedWithMessage({
    tx,
    message: /zero-address/,
  });
};

const deployShouldRevertWithZeroAddress = async ({
  contract,
  args,
}: {
  contract: ContractFactory;
  args: any[];
}): Promise<void> => {
  const deployContractTx = await contract.getDeployTransaction(...args);
  const tx = contract.signer.sendTransaction(deployContractTx);
  await checkTxRevertedWithZeroAddress(tx);
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

const checkTxEmittedEvents = async ({
  contract,
  tx,
  events,
}: {
  contract: Contract;
  tx: Promise<TransactionRequest>;
  events: [{ name: string; args: any[] }];
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
  settersGettersVariablesAndEvents: [
    {
      getterFunc: string;
      variable: any;
      eventEmitted: string;
    }
  ];
}): Promise<void> => {
  const deployContractTx = await contract.getDeployTransaction(...args);
  const tx = contract.signer.sendTransaction(deployContractTx);
  const address = getStatic<(tx: TransactionResponse) => string>(
    contract.constructor,
    'getContractAddress'
  )(await tx);
  const deployedContract = getStatic<
    (
      address: string,
      contractInterface: ContractInterface,
      signer?: Signer
    ) => Contract
  >(contract.constructor, 'getContract')(
    address,
    contract.interface,
    contract.signer
  );
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
  settersGettersVariablesAndEvents: [
    {
      getterFunc: string;
      variable: any;
      eventEmitted: string;
    }
  ];
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
    expect(
      await contract[settersGettersVariablesAndEvents[i].getterFunc].apply(this)
    ).to.eq(settersGettersVariablesAndEvents[i].variable);
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

export default {
  deployShouldRevertWithZeroAddress,
  txShouldRevertWithZeroAddress,
  deployShouldSetVariablesAndEmitEvents,
  txShouldHaveSetVariablesAndEmitEvents,
  txShouldSetVariableAndEmitEvent,
};
