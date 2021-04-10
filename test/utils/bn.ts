import { BigNumber } from 'ethers';

const equal = ({
  value,
  to,
  threshold,
}: {
  value: BigNumber | number | string;
  to: BigNumber | number | string;
  threshold: BigNumber | number | string;
}): boolean => {
  value = toBN(value);
  to = toBN(to);
  threshold = toBN(threshold);
  return to.sub(threshold).lte(value) && to.add(threshold).gte(value);
};

const toBN = (value: string | number | BigNumber): BigNumber => {
  return BigNumber.isBigNumber(value) ? value : BigNumber.from(value);
};

export default {
  equal,
  toBN,
};
