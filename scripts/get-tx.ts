import { ethers } from 'hardhat';
import { abi as IDCAHubABI } from '../artifacts/contracts/interfaces/IDCAHub.sol/IDCAHub.json';

const txHashes = [
  '0xb4ad839b93de62d64666365d56744344a84fcf541dfbd4665ca0f0c16f9a9292',
  '0xe6fd79ef69ef3671f762e764825492c6e480a00d8af7a2bd03cb426997bb201b',
  '0x61b03b882a88818a334b79e96553e8a5416f05d6f259e0c8357932758348b6f6',
  '0xd9ddae825c7a447cd799d9e1dd6d1e61f843b369eeaaa56ee75d73a5d9ae271f',
  '0x016ea48c7431cb861d502f39a5ce3432bd4b63c850597f05425c086625881c65',
  '0x320efea8aa926744d33f5fce22cb498815dd5cfd8d409d109766f1aedf69105e',
  '0x5bce8a5c031145e712fc02dd47f725aa0cf1dc2063cdb3ae6fbdb4169b02f26f',
  '0x334912be1dca132e15a54319c8b69b2ef683f50995a958bd43183ef1b404a522',
  '0x89875f76a4220595522916241fe8890a3d8179778c80f1edaafffc0536154de6',
];
const WBTC_DAI = '0x9a2789dd698d010f3d6bb5bf865369a734d43f83';

async function main() {
  const pair = await ethers.getContractAt(IDCAHubABI, WBTC_DAI);
  for (let y = 0; y < txHashes.length; y++) {
    const txReceipt = await ethers.provider.getTransactionReceipt(txHashes[y]);
    for (let i = 0; i < txReceipt.logs.length; i++) {
      for (let x = 0; x < txReceipt.logs[i].topics.length; x++) {
        if (
          txReceipt.logs[i].address.toLowerCase() == WBTC_DAI.toLowerCase() &&
          txReceipt.logs[i].topics[x] == pair.interface.getEventTopic('Swapped')
        ) {
        }
      }
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
