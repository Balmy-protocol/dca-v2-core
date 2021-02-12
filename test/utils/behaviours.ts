import { expect } from 'chai';
import { Contract } from 'ethers';

const shouldRevertWithZeroAddress = async ({
  contract,
  func,
  args,
}: {
  contract: Contract;
  func: string;
  args: any[];
}) => {
  await expect(contract[func].apply(this, args)).to.be.revertedWith(
    'DDCAPP: zero-address'
  );
};

const shouldSetVariableAndEmitEvent = async ({
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
}) => {
  expect(await contract[getterFunc].apply(this)).to.not.eq(variable);
  await expect(contract[setterFunc].apply(this, [variable]))
    .to.emit(contract, eventEmitted)
    .withArgs(variable);
  expect(await contract[getterFunc].apply(this)).to.eq(variable);
};

export default {
  shouldRevertWithZeroAddress,
  shouldSetVariableAndEmitEvent,
};
