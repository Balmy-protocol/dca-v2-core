import { expect } from 'chai';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { ethers } from 'hardhat';
import { behaviours, constants, wallet } from '@test-utils';
import { given, then, when } from '@test-utils/bdd';
import { ChainlinkOracleMock__factory, ChainlinkOracleMock, FeedRegistryInterface } from '@typechained';
import { snapshot } from '@test-utils/evm';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { FakeContract, smock } from '@defi-wonderland/smock';
import moment from 'moment';
import { BigNumber } from '@ethersproject/bignumber';

describe('ChainlinkOracle', () => {
  const ONE_DAY = moment.duration('24', 'hours').asSeconds();
  const TOKEN_A = '0x0000000000000000000000000000000000000001';
  const TOKEN_B = '0x0000000000000000000000000000000000000002';
  const WETH = '0x0000000000000000000000000000000000000003';
  const NO_PLAN = 0;
  const A_PLAN = 1;

  let governor: SignerWithAddress;
  let feedRegistry: FakeContract<FeedRegistryInterface>;
  let chainlinkOracleFactory: ChainlinkOracleMock__factory;
  let chainlinkOracle: ChainlinkOracleMock;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    [, governor] = await ethers.getSigners();
    chainlinkOracleFactory = await ethers.getContractFactory('contracts/mocks/oracles/ChainlinkOracle.sol:ChainlinkOracleMock');
    feedRegistry = await smock.fake('FeedRegistryInterface');
    chainlinkOracle = await chainlinkOracleFactory.deploy(WETH, feedRegistry.address, ONE_DAY, governor.address);
    snapshotId = await snapshot.take();
  });

  beforeEach('Deploy and configure', async () => {
    await snapshot.revert(snapshotId);
    feedRegistry.latestRoundData.reset();
  });

  describe('constructor', () => {
    when('weth is zero address', () => {
      then('tx is reverted with reason error', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: chainlinkOracleFactory,
          args: [constants.ZERO_ADDRESS, feedRegistry.address, ONE_DAY, governor.address],
          message: 'ZeroAddress',
        });
      });
    });
    when('feed registry is zero address', () => {
      then('tx is reverted with reason error', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: chainlinkOracleFactory,
          args: [WETH, constants.ZERO_ADDRESS, ONE_DAY, governor.address],
          message: 'ZeroAddress',
        });
      });
    });
    when('max delay is zero', () => {
      then('tx is reverted with reason error', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: chainlinkOracleFactory,
          args: [WETH, feedRegistry.address, 0, governor.address],
          message: 'ZeroMaxDelay',
        });
      });
    });
    when('all arguments are valid', () => {
      then('WETH is set correctly', async () => {
        const weth = await chainlinkOracle.WETH();
        expect(weth).to.equal(WETH);
      });
      then('registry is set correctly', async () => {
        const registry = await chainlinkOracle.registry();
        expect(registry).to.eql(feedRegistry.address);
      });
      then('max delay is set correctly', async () => {
        const maxDelay = await chainlinkOracle.maxDelay();
        expect(maxDelay).to.eql(ONE_DAY);
      });
      then('hardcoded stablecoins are considered USD', async () => {
        const stablecoins = [
          '0x6B175474E89094C44Da98b954EedeAC495271d0F',
          '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        ];
        for (const token of stablecoins) {
          expect(await chainlinkOracle.isUSD(token)).to.be.true;
        }
      });
      then('WBTC maps to BTC', async () => {
        const mapping = await chainlinkOracle.mappedToken('0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599');
        expect(mapping).to.equal('0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB');
      });
      then('RENBTC maps to BTC', async () => {
        const mapping = await chainlinkOracle.mappedToken('0xEB4C2781e4ebA804CE9a9803C67d0893436bB27D');
        expect(mapping).to.equal('0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB');
      });
    });
  });

  describe('canSupportPair', () => {
    when('no plan can be found for pair', () => {
      then('pair is not supported', async () => {
        expect(await chainlinkOracle.canSupportPair(TOKEN_A, TOKEN_B)).to.be.false;
      });
    });
    when('a plan can be found for a pair', () => {
      given(async () => {
        await chainlinkOracle.setPricingPlan(TOKEN_A, TOKEN_B, A_PLAN);
      });
      then('pair is supported', async () => {
        expect(await chainlinkOracle.canSupportPair(TOKEN_A, TOKEN_B)).to.be.true;
      });
      then('pair is supported even when tokens are reversed', async () => {
        expect(await chainlinkOracle.canSupportPair(TOKEN_B, TOKEN_A)).to.be.true;
      });
    });
  });

  describe('reconfigureSupportForPair', () => {
    when(`the function is called`, () => {
      given(async () => {
        await chainlinkOracle.setPricingPlan(TOKEN_A, TOKEN_B, A_PLAN);
        await chainlinkOracle.reconfigureSupportForPair(TOKEN_A, TOKEN_B);
      });
      then(`then the internal add support is called directly`, async () => {
        expect(await chainlinkOracle.addSupportForPairCalled(TOKEN_A, TOKEN_B)).to.be.true;
      });
    });
  });

  describe('addSupportForPairIfNeeded', () => {
    when('a plan is already defined', () => {
      given(async () => {
        await chainlinkOracle.setPricingPlan(TOKEN_A, TOKEN_B, A_PLAN);
        await chainlinkOracle.internalAddSupportForPair(TOKEN_A, TOKEN_B);
        await chainlinkOracle.reset(TOKEN_A, TOKEN_B);
      });
      then('internal add support is not called', async () => {
        await chainlinkOracle.addSupportForPairIfNeeded(TOKEN_A, TOKEN_B);
        expect(await chainlinkOracle.addSupportForPairCalled(TOKEN_A, TOKEN_B)).to.be.false;
      });
      then('internal add support is not called even if tokens are inverted', async () => {
        await chainlinkOracle.addSupportForPairIfNeeded(TOKEN_B, TOKEN_A);
        expect(await chainlinkOracle.addSupportForPairCalled(TOKEN_A, TOKEN_B)).to.be.false;
      });
    });
    when('pair is not defined yet', () => {
      given(async () => {
        await chainlinkOracle.setPricingPlan(TOKEN_A, TOKEN_B, A_PLAN);
        await chainlinkOracle.addSupportForPairIfNeeded(TOKEN_A, TOKEN_B);
      });
      then('internal add support is called', async () => {
        expect(await chainlinkOracle.addSupportForPairCalled(TOKEN_A, TOKEN_B)).to.be.true;
      });
    });
  });

  describe('internalAddSupportForPair', () => {
    when('no plan can be found for pair', () => {
      given(async () => {
        await chainlinkOracle.setPricingPlan(TOKEN_A, TOKEN_B, NO_PLAN);
      });
      then('tx is reverted with reason', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: chainlinkOracle,
          func: 'internalAddSupportForPair',
          args: [TOKEN_A, TOKEN_B],
          message: 'PairNotSupported',
        });
      });
    });
    when('a plan can be calculated for the pair', () => {
      const SOME_OTHER_PLAN = 2;
      let tx: TransactionResponse;
      given(async () => {
        await chainlinkOracle.setPricingPlan(TOKEN_A, TOKEN_B, SOME_OTHER_PLAN);
        tx = await chainlinkOracle.internalAddSupportForPair(TOKEN_A, TOKEN_B);
      });
      then(`it is marked as the new plan`, async () => {
        expect(await chainlinkOracle.planForPair(TOKEN_A, TOKEN_B)).to.eql(SOME_OTHER_PLAN);
      });

      then('event is emitted', async () => {
        await expect(tx).to.emit(chainlinkOracle, 'AddedSupportForPairInChainlinkOracle').withArgs(TOKEN_A, TOKEN_B);
      });
    });
  });

  describe('addUSDStablecoins', () => {
    when('function is called by governor', () => {
      const TOKEN_ADDRESS = wallet.generateRandomAddress();
      let tx: TransactionResponse;
      given(async () => {
        tx = await chainlinkOracle.connect(governor).addUSDStablecoins([TOKEN_ADDRESS]);
      });
      then('address is considered USD', async () => {
        expect(await chainlinkOracle.isUSD(TOKEN_ADDRESS)).to.be.true;
      });
      then('event is emitted', async () => {
        await expect(tx).to.emit(chainlinkOracle, 'TokensConsideredUSD').withArgs([TOKEN_ADDRESS]);
      });
    });

    behaviours.shouldBeExecutableOnlyByGovernor({
      contract: () => chainlinkOracle,
      funcAndSignature: 'addUSDStablecoins(address[])',
      params: [[wallet.generateRandomAddress()]],
      governor: () => governor,
    });
  });

  describe('addMappings', () => {
    when('input sizes do not match', () => {
      then('tx is reverted with reason', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: chainlinkOracle.connect(governor),
          func: 'addMappings',
          args: [[TOKEN_A], [TOKEN_A, TOKEN_B]],
          message: 'InvalidMappingsInput',
        });
      });
    });
    when('function is called by governor', () => {
      const TOKEN_ADDRESS = wallet.generateRandomAddress();
      let tx: TransactionResponse;
      given(async () => {
        tx = await chainlinkOracle.connect(governor).addMappings([TOKEN_A], [TOKEN_ADDRESS]);
      });
      then('mapping is registered', async () => {
        expect(await chainlinkOracle.mappedToken(TOKEN_A)).to.equal(TOKEN_ADDRESS);
      });
      then('event is emmitted', async () => {
        await expect(tx).to.emit(chainlinkOracle, 'MappingsAdded').withArgs([TOKEN_A], [TOKEN_ADDRESS]);
      });
    });
    behaviours.shouldBeExecutableOnlyByGovernor({
      contract: () => chainlinkOracle,
      funcAndSignature: 'addMappings(address[],address[])',
      params: [[TOKEN_A], [wallet.generateRandomAddress()]],
      governor: () => governor,
    });
  });
  describe('intercalCallRegistry', () => {
    when('price is negative', () => {
      given(() => makeRegistryReturn({ price: -1 }));
      thenRegistryCallRevertsWithReason('InvalidPrice');
    });
    when('price is zero', () => {
      given(() => makeRegistryReturn({ price: 0 }));
      thenRegistryCallRevertsWithReason('InvalidPrice');
    });
    when('last update was > 24hs ago', () => {
      const LAST_UPDATE_AGO = moment.duration('24', 'hours').as('seconds') + moment.duration('15', 'minutes').as('seconds');
      given(() => makeRegistryReturn({ lastUpdate: moment().unix() - LAST_UPDATE_AGO }));
      thenRegistryCallRevertsWithReason('LastUpdateIsTooOld');
    });
    when('call to the registry reverts', () => {
      const NO_REASON = '';
      given(() => feedRegistry.latestRoundData.reverts(NO_REASON));
      thenRegistryCallRevertsWithReason(NO_REASON);
    });
    when('max delay is the biggest possible', () => {
      const PRICE = 10;
      let chainlinkOracle: ChainlinkOracleMock;
      given(async () => {
        makeRegistryReturn({ price: PRICE });
        chainlinkOracle = await chainlinkOracleFactory.deploy(WETH, feedRegistry.address, BigNumber.from(2).pow(32).sub(1), governor.address);
      });
      then('price is returned correctly', async () => {
        expect(await chainlinkOracle.intercalCallRegistry(TOKEN_A, TOKEN_A)).to.equal(PRICE);
      });
    });
    function makeRegistryReturn({ price, lastUpdate }: { price?: number; lastUpdate?: number }) {
      feedRegistry.latestRoundData.returns([0, price ?? 1, 0, lastUpdate ?? moment().unix(), 0]);
    }
    async function thenRegistryCallRevertsWithReason(reason: string) {
      then('_callRegistry reverts with reason', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: chainlinkOracle,
          func: 'intercalCallRegistry',
          args: [TOKEN_A, TOKEN_B],
          message: reason,
        });
      });
    }
  });
});
