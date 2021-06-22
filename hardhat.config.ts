import 'dotenv/config';
import '@nomiclabs/hardhat-waffle';
import '@nomiclabs/hardhat-ethers';
import '@nomiclabs/hardhat-etherscan';
import { removeConsoleLog } from 'hardhat-preprocessor';
import 'hardhat-gas-reporter';
import 'hardhat-contract-sizer';
import 'hardhat-deploy';
import 'solidity-coverage';
import { HardhatUserConfig, NetworksUserConfig } from 'hardhat/types';

const networks: NetworksUserConfig = process.env.TEST
  ? {}
  : {
      hardhat: {
        forking: {
          enabled: process.env.FORK ? true : false,
          url: process.env.MAINNET_HTTPS_URL as string,
        },
        tags: ['test', 'local'],
      },
      localhost: {
        url: process.env.LOCAL_HTTP_URL,
        live: false,
        accounts: [process.env.LOCAL_PRIVATE_KEY as string],
        tags: ['local'],
      },
      kovan: {
        url: process.env.KOVAN_HTTPS_URL,
        accounts: [process.env.KOVAN_PRIVATE_KEY as string],
        gasPrice: 'auto',
        tags: ['staging'],
      },
      mainnet: {
        url: process.env.MAINNET_HTTPS_URL,
        accounts: [process.env.MAINNET_PRIVATE_KEY as string],
        gasPrice: 'auto',
        tags: ['production'],
      },
    };

const config: HardhatUserConfig = {
  defaultNetwork: 'hardhat',
  namedAccounts: {
    deployer: 0,
    governor: 1,
    feeRecipient: 2,
  },
  networks,
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

export default config;
