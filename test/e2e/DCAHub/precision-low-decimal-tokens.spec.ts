import { ethers } from 'hardhat';
import {
  DCAHub,
  DCAHubSwapCalleeMock,
  DCAHubSwapCalleeMock__factory,
  DCAHub__factory,
  DCAPermissionsManager,
  DCAPermissionsManager__factory,
  ITokenPriceOracle,
} from '@typechained';
import { constants, erc20 } from '@test-utils';
import { contract, given, then, when } from '@test-utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { TokenContract } from '@test-utils/erc20';
import { FakeContract, smock } from '@defi-wonderland/smock';
import { buildSwapInput } from 'js-lib/swap-utils';
import { SwapInterval } from 'js-lib/interval-utils';
import { BigNumber } from 'ethers';
import { expect } from 'chai';
import { snapshot } from '@test-utils/evm';

contract('DCAHub', () => {
  describe('Precision with low decimal tokens', () => {
    const BYTES = ethers.utils.hexlify(ethers.utils.randomBytes(5));
    const PRICE_IN_USDC = 100;

    let governor: SignerWithAddress;
    let alice: SignerWithAddress;
    let USDC: TokenContract, myToken: TokenContract;
    let DCAHubFactory: DCAHub__factory, DCAHub: DCAHub;
    let priceOracle: FakeContract<ITokenPriceOracle>;
    let DCAPermissionsManager: DCAPermissionsManager;
    let DCAHubSwapCalleeFactory: DCAHubSwapCalleeMock__factory, DCAHubSwapCallee: DCAHubSwapCalleeMock;
    let snapshotId: string;

    before('Setup accounts and contracts', async () => {
      [governor, alice] = await ethers.getSigners();
      DCAHubFactory = await ethers.getContractFactory('contracts/DCAHub/DCAHub.sol:DCAHub');
      const DCAPermissionsManagerFactory: DCAPermissionsManager__factory = await ethers.getContractFactory(
        'contracts/DCAPermissionsManager/DCAPermissionsManager.sol:DCAPermissionsManager'
      );
      DCAHubSwapCalleeFactory = await ethers.getContractFactory('contracts/mocks/DCAHubSwapCallee.sol:DCAHubSwapCalleeMock');
      USDC = await erc20.deploy({
        name: 'USDC',
        symbol: 'USDC',
        decimals: 6,
      });
      myToken = await erc20.deploy({
        name: 'MyTKN',
        symbol: 'MyTKN',
        decimals: 18,
      });
      priceOracle = await smock.fake('ITokenPriceOracle');
      DCAPermissionsManager = await DCAPermissionsManagerFactory.deploy(constants.NOT_ZERO_ADDRESS, constants.NOT_ZERO_ADDRESS);
      DCAHub = await DCAHubFactory.deploy(governor.address, governor.address, priceOracle.address, DCAPermissionsManager.address);
      await DCAHub.setAllowedTokens([USDC.address, myToken.address], [true, true]);
      await DCAPermissionsManager.setHub(DCAHub.address);
      DCAHubSwapCallee = await DCAHubSwapCalleeFactory.deploy();

      await DCAHubSwapCallee.setInitialBalances([USDC.address, myToken.address], [USDC.asUnits(100_000_000), myToken.asUnits(2000)]);
      await DCAHub.addSwapIntervalsToAllowedList([SwapInterval.ONE_HOUR.seconds]);
      await setInitialBalance(alice, { tokenA: 0, tokenB: 10000000 });
      await setInitialBalance(DCAHubSwapCallee, { tokenA: 100_000_000, tokenB: 2000 });
      snapshotId = await snapshot.take();
    });

    beforeEach('Deploy and configure', async () => {
      await snapshot.revert(snapshotId);

      // magnitude(myToken) == 100 units of USDC
      priceOracle.quote.returns(USDC.address < myToken.address ? PRICE_IN_USDC : USDC.magnitude.mul(myToken.magnitude).div(PRICE_IN_USDC));
    });

    when('position is created and swap is executed', () => {
      let expectedSwapped: BigNumber, expectedPlatformFee: BigNumber;
      given(async () => {
        const amountToSwap = myToken.magnitude.mul(1_000_000);
        await myToken.connect(alice).approve(DCAHub.address, constants.MAX_UINT_256);
        await DCAHub.connect(alice)['deposit(address,address,uint256,uint32,uint32,address,(address,uint8[])[])'](
          myToken.address,
          USDC.address,
          amountToSwap,
          1,
          SwapInterval.ONE_HOUR.seconds,
          alice.address,
          []
        );

        await swap({ callee: DCAHubSwapCallee });

        expectedSwapped = amountToSwap.mul(PRICE_IN_USDC).mul(9940).div(10000).div(myToken.magnitude); // 99.4%
        expectedPlatformFee = amountToSwap.mul(PRICE_IN_USDC).mul(15).div(10000).div(myToken.magnitude); // 0.15%
      });

      then('swapped balance is calculated correctly', async () => {
        const positon = await DCAHub.connect(alice).userPosition(1);
        expect(positon.swapped).to.equal(expectedSwapped);
      });

      then('hub balance is enough for the withdraw', async () => {
        const hubBalance = await USDC.balanceOf(DCAHub.address);
        expect(hubBalance).to.equal(expectedSwapped.add(expectedPlatformFee));
      });
    });

    async function swap({ callee }: { callee: HasAddress }) {
      const { tokens, pairIndexes, borrow } = buildSwapInput([{ tokenA: USDC.address, tokenB: myToken.address }], []);
      await DCAHub.swap(tokens, pairIndexes, callee.address, callee.address, borrow, BYTES, BYTES);
    }

    async function setInitialBalance(
      hasAddress: HasAddress,
      { tokenA: amountTokenA, tokenB: amountTokenB }: { tokenA: number; tokenB: number }
    ) {
      await USDC.mint(hasAddress.address, USDC.asUnits(amountTokenA));
      await myToken.mint(hasAddress.address, myToken.asUnits(amountTokenB));
    }

    type HasAddress = {
      readonly address: string;
    };
  });
});
