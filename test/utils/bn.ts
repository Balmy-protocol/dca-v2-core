import { BigNumber, BigNumberish } from 'ethers';
import { expect } from 'chai';

const expectToEqualWithThreshold = ({
  value,
  to,
  threshold,
}: {
  value: BigNumber | number | string;
  to: BigNumber | number | string;
  threshold: BigNumber | number | string;
}): void => {
  value = toBN(value);
  to = toBN(to);
  threshold = toBN(threshold);
  expect(
    to.sub(threshold).lte(value) && to.add(threshold).gte(value),
    `Expected ${value.toString()} to be between ${to.sub(threshold).toString()} and ${to.add(threshold).toString()}`
  ).to.be.true;
};

const expectArraysToBeEqual = (arr1: BigNumber[] | number[] | string[], arr2: BigNumber[] | number[] | string[]): void => {
  const parsedArr1 = arr1.map((val: BigNumber | number | string) => toBN(val));
  const parsedArr2 = arr2.map((val: BigNumber | number | string) => toBN(val));
  parsedArr1.forEach((val: BigNumber, index: number) => {
    expect(val).to.be.equal(parsedArr2[index], `array differs on index ${index}`);
  });
};

const toBN = (value: BigNumberish): BigNumber => {
  return BigNumber.isBigNumber(value) ? value : BigNumber.from(value);
};

export default {
  expectToEqualWithThreshold,
  expectArraysToBeEqual,
  toBN,
};
