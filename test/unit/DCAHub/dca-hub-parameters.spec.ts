import { BigNumber, BigNumberish, Contract, utils } from 'ethers';
import { ethers } from 'hardhat';
import { ERC20Mock, DCAHubParametersMock__factory, DCAHubParametersMock } from '@typechained';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { constants, erc20, behaviours, bn, wallet, contracts } from '@test-utils';
import { contract, given, then, when } from '@test-utils/bdd';
import { snapshot } from '@test-utils/evm';
import { expect } from 'chai';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import moment from 'moment';

contract('DCAHubParameters', function () {
  const SWAP_INTERVALS_DESCRIPTIONS = [
    'Every 5 minutes',
    'Every 15 minutes',
    'Evert 30 minutes',
    'Hourly',
    'Every 12 hours',
    'Daily',
    'Weekly',
    'Monthy',
  ];
  let owner: SignerWithAddress;
  let tokenA: ERC20Mock, tokenB: ERC20Mock;
  let DCAHubParametersContract: DCAHubParametersMock__factory;
  let DCAHubParameters: DCAHubParametersMock;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    [owner] = await ethers.getSigners();
    DCAHubParametersContract = await ethers.getContractFactory('contracts/mocks/DCAHub/DCAHubParameters.sol:DCAHubParametersMock');
    tokenA = (await erc20.deploy({
      name: 'DAI',
      symbol: 'DAI',
      initialAccount: await owner.getAddress(),
      initialAmount: utils.parseEther('1'),
    })) as ERC20Mock;
    tokenB = (await erc20.deploy({
      name: 'DAI',
      symbol: 'DAI',
      initialAccount: await owner.getAddress(),
      initialAmount: utils.parseEther('1'),
    })) as ERC20Mock;
    DCAHubParameters = await DCAHubParametersContract.deploy();
    snapshotId = await snapshot.take();
  });

  beforeEach('Deploy and configure', async () => {
    await snapshot.revert(snapshotId);
  });

  describe('constructor', () => {
    when('all arguments are valid', () => {
      let deploymentTx: TransactionResponse;
      let deployedContract: Contract;
      given(async () => {
        const deployment = await contracts.deploy(DCAHubParametersContract, []);
        deploymentTx = deployment.tx;
        deployedContract = deployment.contract;
      });
      then('internal balance for token A starts as 0', async () => {
        expect(await deployedContract.internalBalanceOf(tokenA.address)).to.equal(0);
      });
      then('internal balance for token B starts as 0', async () => {
        expect(await deployedContract.internalBalanceOf(tokenB.address)).to.equal(0);
      });
      then('descriptions are as expected', async () => {
        for (let i = 0; i < SWAP_INTERVALS_DESCRIPTIONS.length; i++) {
          expect(await deployedContract.SWAP_INTERVALS_DESCRIPTIONS(i)).to.equal(SWAP_INTERVALS_DESCRIPTIONS[i]);
        }
      });
    });
  });

  describe('intervalToMask/maskToInterval', () => {
    const SUPPORTED_SWAP_INTERVALS = [
      moment.duration(5, 'minutes').asSeconds(),
      moment.duration(15, 'minutes').asSeconds(),
      moment.duration(30, 'minutes').asSeconds(),
      moment.duration(1, 'hour').asSeconds(),
      moment.duration(12, 'hours').asSeconds(),
      moment.duration(1, 'day').asSeconds(),
      moment.duration(1, 'week').asSeconds(),
      moment.duration(30, 'days').asSeconds(),
    ];

    when('calling intervalToMask with an invalid input', () => {
      then('reverts with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAHubParameters,
          func: 'intervalToMask',
          args: [0],
          message: 'InvalidInterval',
        });
      });
    });

    when('calling maskToInterval with an invalid input', () => {
      then('reverts with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAHubParameters,
          func: 'maskToInterval',
          args: [0],
          message: 'InvalidMask',
        });
      });
    });

    when('calling intervalToMask/maskToInterval with a valid input', () => {
      then('then result is returned correctly', async () => {
        for (let i = 0; i < SUPPORTED_SWAP_INTERVALS.length; i++) {
          const interval = SUPPORTED_SWAP_INTERVALS[i];
          const mask = '0x' + (1 << i).toString(16).padStart(2, '0');
          expect(await DCAHubParameters.intervalToMask(interval)).to.equal(mask);
          expect(await DCAHubParameters.maskToInterval(mask)).to.equal(interval);
        }
      });
    });
  });

  const getFeeFromAmountTest = async ({ title, amount, fee }: { title: string; amount: BigNumber | number | string; fee: BigNumberish }) => {
    when(title, () => {
      then('fee from amount is correct', async () => {
        expect(await DCAHubParameters.getFeeFromAmount(fee, amount)).to.equal(await getFeeFrom(fee, amount));
      });
    });
  };

  describe('_getFeeFromAmount', () => {
    getFeeFromAmountTest({
      title: 'multiplying amount for protocol fee does not overflow',
      amount: utils.parseEther('9482.12343'),
      fee: 3000,
    });
  });

  async function getFeeFrom(fee: BigNumberish, value: BigNumber | string | number): Promise<BigNumber> {
    value = bn.toBN(value);
    const feePrecision = BigNumber.from(await DCAHubParameters.FEE_PRECISION());
    if (value.mul(fee).lt(constants.MAX_UINT_256)) {
      return value.mul(fee).div(feePrecision).div(100);
    } else {
      return feePrecision.lt(fee) ? value.div(feePrecision).div(100).mul(fee) : value.div(feePrecision).mul(fee).div(100);
    }
  }
});
