import { Event } from 'ethers';
import { hexZeroPad, id } from 'ethers/lib/utils';
import { run, ethers } from 'hardhat';
import _ from 'lodash';

async function main() {
  const pair = await ethers.getContractAt('contracts/interfaces/IDCAPair.sol:IDCAPair', '0x4fae2c865bdb0c58b77cc5a387090cdf0567eebb');
  // let tx = await ethers.provider.getTransaction('0x027830518c6522e487572aab1803f742c4269d166b243a68343d0f7f94e8b8c2');
  // let parsedTx = pair.interface.parseTransaction(tx);
  // console.log('FIRST TX');
  // console.log('tx');
  // console.log(parsedTx.args['dcaId'].toString());
  // let txReceipt = await ethers.provider.getTransactionReceipt('0x027830518c6522e487572aab1803f742c4269d166b243a68343d0f7f94e8b8c2');
  // console.log('logs');
  // txReceipt.logs.forEach((log) => {
  //   try {
  //     console.log(pair.interface.parseLog(log).args.dcaId.toString());
  //   } catch (err) { }
  // });
  // console.log('\n\n\n');
  // console.log('SECOND TX');
  // const tx = await ethers.provider.getTransaction('0xcdb3666fe7214121493adf43e4b15ad6af052ed1589c669b818602d5c00c7a27');
  // const parsedTx = pair.interface.parseTransaction(tx);
  // console.log('tx');
  // console.log(parsedTx.args);
  // const txReceipt = await ethers.provider.getTransactionReceipt('0xcdb3666fe7214121493adf43e4b15ad6af052ed1589c669b818602d5c00c7a27');
  // console.log('logs');
  // txReceipt.logs.forEach((log) => {
  //   try {
  //     console.log(pair.interface.parseLog(log).args);
  //   } catch (err) { }
  // });
  // const position = await pair.userPosition(5);
  // "0x4fae2c865bdb0c58b77cc5a387090cdf0567eebb-0x49acc5d54acc32396c8846bbe5ef9348107f72089718afdaa23b59ec48375342-16"
  // },
  // {
  //   "id": "0x4fae2c865bdb0c58b77cc5a387090cdf0567eebb-0x898153b05be0e581579f058ae71e8a8563b2dfedeb98900f64213fd3dd981e8c-27"
  // },
  // {
  //   "id": "0x4fae2c865bdb0c58b77cc5a387090cdf0567eebb-0x8a311cce57df7a18104af805403bfd3404962d08c4e644bfd9102ef4f459f330-13"

  const isOurPair = (address1: string, address2: string): boolean => {
    return (
      (address1.toLowerCase() == '0x2203b1492a6043baf776f41f9feae7f13f357557' &&
        address2.toLowerCase() == '0x1295d31a824f1d516ad624665120e22d38ac2c77') ||
      (address1.toLowerCase() == '0x1295d31a824f1d516ad624665120e22d38ac2c77' &&
        address2.toLowerCase() == '0x2203b1492a6043baf776f41f9feae7f13f357557')
    );
  };

  const logthisshit = (log: any) => {
    try {
      const parsedLog = pair.interface.parseLog(log);
      if (
        isOurPair(parsedLog.args._nextSwapInformation.tokenToBeProvidedBySwapper, parsedLog.args._nextSwapInformation.tokenToRewardSwapperWith)
      )
        console.log(parsedLog.args);
    } catch (err) {}
  };
  console.log('\n\nSWAP 1 ');
  const swap1 = await ethers.provider.getTransactionReceipt('0x49acc5d54acc32396c8846bbe5ef9348107f72089718afdaa23b59ec48375342');
  swap1.logs.forEach(logthisshit);

  console.log('\n\nSWAP 2 ');
  const swap2 = await ethers.provider.getTransactionReceipt('0x898153b05be0e581579f058ae71e8a8563b2dfedeb98900f64213fd3dd981e8c');
  swap2.logs.forEach(logthisshit);

  console.log('\n\nSWAP 3 ');

  const swap3 = await ethers.provider.getTransactionReceipt('0x8a311cce57df7a18104af805403bfd3404962d08c4e644bfd9102ef4f459f330');
  swap3.logs.forEach(logthisshit);

  // SWAP 1
  // ratePerUnitBToA: BigNumber { _hex: '0x2355118f3114f8', _isBigNumber: true },
  // ratePerUnitAToB: BigNumber { _hex: '0x05736e7cf48cf72e01', _isBigNumber: true },

  // SWAP 2
  // ratePerUnitBToA: BigNumber { _hex: '0x2355118f3114f8', _isBigNumber: true },
  // ratePerUnitAToB: BigNumber { _hex: '0x05736e7cf48cf72e01', _isBigNumber: true },

  // SWAP 3
  // ratePerUnitBToA: BigNumber { _hex: '0x2355118f3114f8', _isBigNumber: true },
  // ratePerUnitAToB: BigNumber { _hex: '0x05736e7cf48cf72e01', _isBigNumber: true },

  // const swaps = await pair.queryFilter({
  //   topics: [
  //     id("Swapped(address,address,uint256,uint256,uint32,((uint32,uint32,uint256,uint256)[],uint8,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,address,address))"),
  //   ]
  // }, SEBI_DEPOSIT);
  // console.log(swaps);

  // const sebiDeposits = await pair.filters.Deposited('0x376ce4664dfc2e56caf8617ac5717dc952cd3001');

  // const sebiDeposits = await pair.queryFilter({
  //   topics: [
  //     id("Deposited(address,uint256,address,uint160,uint32,uint32,uint32)"),
  //     // [
  //     //   '0x000000000000000000000000376ce4664dfc2e56caf8617ac5717dc952cd3001',
  //     //   '0x0000000000000000000000000000000000000000000000000000000000000005'
  //     // ]
  //   ]
  // }, SEBI_DEPOSIT - 1);

  // const sebiModifications = await pair.queryFilter({
  //   topics: [
  //     id("Modified(address,uint256,uint160,uint32,uint32)"),
  //     // [
  //     //   '0x000000000000000000000000376ce4664dfc2e56caf8617ac5717dc952cd3001',
  //     //   '0x0000000000000000000000000000000000000000000000000000000000000005'
  //     // ]
  //   ]
  // }, SEBI_DEPOSIT - 1);

  // const allStuff = _.merge([], [], [], swaps);

  // const orderStuff = _.sortBy(allStuff, (log: Event) => log.blockNumber);

  // orderStuff.forEach(order => {
  //   console.log(order.event, order.blockNumber);
  //   console.log(order.transactionHash);
  //   // console.log(order.args);
  // })
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
