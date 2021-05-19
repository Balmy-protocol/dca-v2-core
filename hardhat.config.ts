import 'dotenv/config';
import '@nomiclabs/hardhat-waffle';
import '@nomiclabs/hardhat-etherscan';
import { removeConsoleLog } from 'hardhat-preprocessor';
import 'hardhat-gas-reporter';
import 'hardhat-contract-sizer';
import 'solidity-coverage';

module.exports = {
  defaultNetwork: 'hardhat',
  networks: process.env.TEST
    ? {}
    : {
        hardhat: {
          enabled: process.env.FORK ? true : false,
          forking: {
            url: process.env.MAINNET_HTTPS_URL,
          },
        },
        localMainnet: {
          url: process.env.LOCAL_MAINNET_HTTP_URL,
          accounts: [process.env.LOCAL_MAINNET_PRIVATE_KEY],
          gasMultiplier: 1.1,
        },
        ropsten: {
          url: process.env.ROPSTEN_HTTPS_URL,
          accounts: [process.env.ROPSTEN_PRIVATE_KEY],
          gasMultiplier: 1.1,
          gasPrice: 'auto',
        },
        mainnet: {
          url: process.env.MAINNET_HTTPS_URL,
          accounts: [process.env.MAINNET_PRIVATE_KEY],
          gasMultiplier: 1.1,
          gasPrice: 'auto',
        },
      },
  solidity: {
    compilers: [
      {
        version: '0.8.4',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  gasReporter: {
    currency: process.env.COINMARKETCAP_DEFAULT_CURRENCY || 'USD',
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
    enabled: process.env.REPORT_GAS ? true : false,
  },
  preprocess: {
    eachLine: removeConsoleLog((hre) => hre.network.name !== 'hardhat'),
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
};
