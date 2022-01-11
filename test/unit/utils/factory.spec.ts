import { utils } from 'ethers';
import { ethers } from 'hardhat';
import { wallet, contracts } from '@test-utils';
import { given, then, when } from '@test-utils/bdd';
import { expect } from 'chai';
import { bytecode as governableMockBytecode } from '@artifacts/contracts/mocks/utils/Governable.sol/GovernableMock.json';
import { Factory, Factory__factory, GovernableMock, GovernableMock__factory } from '@typechained';
import { snapshot } from '@test-utils/evm';
import { TransactionResponse } from '@ethersproject/providers';
import { readArgFromEvent } from '@test-utils/event-utils';

const governor = wallet.generateRandomAddress();
const governor2 = wallet.generateRandomAddress2();
const salt = utils.formatBytes32String('grizz');

describe('Factory', function () {
  let factoryContract: Factory__factory;
  let factory: Factory;
  let governableContract: GovernableMock__factory;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    factoryContract = await ethers.getContractFactory('contracts/utils/Factory.sol:Factory');
    governableContract = await ethers.getContractFactory('contracts/mocks/utils/Governable.sol:GovernableMock');
    factory = await factoryContract.deploy();
    snapshotId = await snapshot.take();
  });

  beforeEach('Deploy and configure', async () => {
    await snapshot.revert(snapshotId);
  });

  describe('deploy', () => {
    when('when deploying with same arguments and salt', () => {
      let deployment: DeploymentThroughFactory;
      given(async () => {
        deployment = await deployThroughFactory({
          salt,
          governor,
        });
      });
      then('first contract is initialized with correct arguments', async () => {
        expect(await deployment.contract.governor()).to.equal(governor);
      });
      then('first contract emits event', async () => {
        expect(await readArgFromEvent(deployment.tx, 'ContractDeployed', '_deploymentAddress')).to.equal(deployment.contract.address);
      });
      then('second deployment should fail');
    });
    when('deploying with different arguments and same salt', () => {
      let firstDeployment: DeploymentThroughFactory;
      let secondDeployment: DeploymentThroughFactory;
      given(async () => {
        firstDeployment = await deployThroughFactory({
          salt,
          governor,
        });
        secondDeployment = await deployThroughFactory({
          salt,
          governor: governor2,
        });
      });
      then('contracts are initialized with correct arguments', async () => {
        expect(await firstDeployment.contract.governor()).to.equal(governor);
        expect(await secondDeployment.contract.governor()).to.equal(governor2);
      });
      then('contracts addresses should be different', async () => {
        expect(firstDeployment.contract.address).to.not.be.equal(secondDeployment.contract.address);
      });
    });
    when('deploying with same arguments but different salt', () => {
      let firstDeployment: DeploymentThroughFactory;
      let secondDeployment: DeploymentThroughFactory;
      given(async () => {
        firstDeployment = await deployThroughFactory({
          salt,
          governor,
        });
        secondDeployment = await deployThroughFactory({
          salt: utils.formatBytes32String('grizz2'),
          governor: governor,
        });
      });
      then('contracts are initialized with correct arguments', async () => {
        expect(await firstDeployment.contract.governor()).to.equal(governor);
        expect(await secondDeployment.contract.governor()).to.equal(governor);
      });
      then('contracts addresses should be different', async () => {
        expect(firstDeployment.contract.address).to.not.be.equal(secondDeployment.contract.address);
      });
    });
    // Until hardhat allows to change chain id on the fly, is not possible to test
    when.skip('deploying with same parameters on different chain ids', () => {
      then('contract is initialized with correct arguments');
      then('contract addresses should be the same');
    });
  });

  describe('computeAddress', () => {
    when('computing addresses with same arguments and salt', () => {
      const creationCode = contracts.getCreationCode({
        bytecode: governableMockBytecode,
        constructorArgs: {
          types: ['address'],
          values: [governor],
        },
      });
      then('computed addresses should be the same', async () => {
        expect(
          await computeAddress({
            salt,
            governor,
          })
        ).to.equal(
          await computeAddress({
            salt,
            governor,
          })
        );
      });
    });
    when('computing addresses with different arguments but same salt', () => {
      then('computed addresses should be different', async () => {
        expect(
          await computeAddress({
            salt,
            governor,
          })
        ).to.not.equal(
          await computeAddress({
            salt,
            governor: governor2,
          })
        );
      });
    });

    when('computing addresses with same arguments but different salt', () => {
      then('computed addresses should be different', async () => {
        expect(
          await computeAddress({
            salt,
            governor,
          })
        ).to.not.equal(
          await computeAddress({
            salt: utils.formatBytes32String('grizz2'),
            governor,
          })
        );
      });
    });
    // Until hardhat allows to change chain id on the fly, is not possible to test
    when.skip('computing addresses with same parameters on different chain ids', () => {
      then('computed addresses should be the same');
    });
  });

  type DeploymentThroughFactory = {
    tx: TransactionResponse;
    contract: GovernableMock;
  };

  async function deployThroughFactory({ salt, governor }: { salt: string; governor: string }): Promise<DeploymentThroughFactory> {
    const creationCode = contracts.getCreationCode({
      bytecode: governableMockBytecode,
      constructorArgs: {
        types: ['address'],
        values: [governor],
      },
    });
    const deploymentAddress = await factory.callStatic.deploy(salt, creationCode);
    const deploymentTx = await factory.deploy(salt, creationCode);
    const deployedContract = GovernableMock__factory.connect(deploymentAddress, ethers.provider);
    return {
      tx: deploymentTx,
      contract: deployedContract,
    };
  }

  async function computeAddress({ salt, governor }: { salt: string; governor: string }): Promise<string> {
    const creationCode = contracts.getCreationCode({
      bytecode: governableMockBytecode,
      constructorArgs: {
        types: ['address'],
        values: [governor],
      },
    });
    return await factory.computeAddress(salt, creationCode);
  }
});
