import '@nomiclabs/hardhat-waffle';
import '@nomiclabs/hardhat-etherscan';
import { removeConsoleLog } from 'hardhat-preprocessor';
import 'hardhat-gas-reporter';
import 'solidity-coverage';
import config from './.config.json';

let hardhat = {};

if (process.env.FORK) {
  hardhat = {
    forking: {
      url: `https://eth-mainnet.alchemyapi.io/v2/${config.alchemy.mainnet.apiKey}`,
    },
  };
}

module.exports = {
  defaultNetwork: 'hardhat',
  networks: {
    hardhat,
    localMainnet: {
      url: 'http://127.0.0.1:8545',
      accounts: [config.accounts.mainnet.privateKey],
      gasMultiplier: 1.1,
    },
    ropsten: {
      url: `https://eth-ropsten.alchemyapi.io/v2/${config.alchemy.ropsten.apiKey}`,
      accounts: [config.accounts.ropsten.privateKey],
      gasMultiplier: 1.1,
      gasPrice: 'auto',
    },
    mainnet: {
      url: `https://eth-mainnet.alchemyapi.io/v2/${config.alchemy.mainnet.apiKey}`,
      accounts: [config.accounts.mainnet.privateKey],
      gasMultiplier: 1.1,
      gasPrice: 'auto',
    },
  },
  solidity: {
    compilers: [
      {
        version: '0.7.0',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  mocha: {
    timeout: 100000,
  },
  gasReporter: {
    currency: 'USD',
    coinmarketcap: config.coinmarketcap.apiKey,
    enabled: process.env.REPORT_GAS ? true : false,
  },
  preprocess: {
    eachLine: removeConsoleLog(
      (hre) =>
        hre.network.name !== 'hardhat' && hre.network.name !== 'localhost'
    ),
  },
  etherscan: {
    apiKey: `${config.etherscan.apiKey}`,
  },
};
