import 'dotenv/config';
import '@nomiclabs/hardhat-waffle';
import '@nomiclabs/hardhat-ethers';
import '@nomiclabs/hardhat-etherscan';
import '@typechain/hardhat';
import '@typechain/hardhat/dist/type-extensions';
import { removeConsoleLog } from 'hardhat-preprocessor';
import 'hardhat-gas-reporter';
import 'hardhat-contract-sizer';
import 'hardhat-deploy';
import 'solidity-coverage';
import './tasks/npm-publish-clean-typechain';
import { HardhatUserConfig, MultiSolcUserConfig, NetworksUserConfig } from 'hardhat/types';
import { getNodeUrl, accounts } from './utils/network';
import 'tsconfig-paths/register';

const networks: NetworksUserConfig = process.env.TEST
  ? {
      hardhat: {
        allowUnlimitedContractSize: true,
        chainId: 1, // We are trying to mock mainnet
      },
    }
  : {
      hardhat: {
        forking: {
          enabled: process.env.FORK ? true : false,
          url: getNodeUrl('optimism'),
        },
        tags: ['test', 'local'],
      },
      localhost: {
        url: getNodeUrl('localhost'),
        live: false,
        accounts: accounts('localhost'),
        tags: ['local'],
      },
      rinkeby: {
        url: getNodeUrl('rinkeby'),
        accounts: accounts('rinkeby'),
        tags: ['staging'],
      },
      ropsten: {
        url: getNodeUrl('ropsten'),
        accounts: accounts('ropsten'),
        tags: ['staging'],
      },
      kovan: {
        url: getNodeUrl('kovan'),
        accounts: accounts('kovan'),
        tags: ['staging'],
      },
      goerli: {
        url: getNodeUrl('goerli'),
        accounts: accounts('goerli'),
        tags: ['staging'],
      },
      mainnet: {
        url: getNodeUrl('mainnet'),
        accounts: accounts('mainnet'),
        tags: ['production'],
      },
      optimism: {
        url: 'https://mainnet.optimism.io',
        accounts: accounts('optimism'),
        tags: ['production'],
      },
      'optimism-kovan': {
        url: 'https://kovan.optimism.io',
        accounts: accounts('optimism-kovan'),
        tags: ['staging'],
      },
      mumbai: {
        url: 'https://rpc-mumbai.matic.today',
        accounts: accounts('mumbai'),
        tags: ['staging'],
      },
      polygon: {
        url: 'https://polygon-rpc.com',
        accounts: accounts('polygon'),
        tags: ['production'],
      },
    };

const config: HardhatUserConfig = {
  defaultNetwork: 'hardhat',
  mocha: {
    timeout: process.env.MOCHA_TIMEOUT || 300000,
  },
  namedAccounts: {
    deployer: 4,
    governor: '0x1a00e1E311009E56e3b0B9Ed6F86f5Ce128a1C01',
  },
  networks,
  solidity: {
    compilers: [
      {
        version: '0.8.13',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: '0.7.6',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
    overrides: {
      '@uniswap/v3-core/contracts/libraries/FullMath.sol': {
        version: '0.7.6',
      },
      '@uniswap/v3-core/contracts/libraries/TickMath.sol': {
        version: '0.7.6',
      },
      '@uniswap/v3-periphery/contracts/libraries/PoolAddress.sol': {
        version: '0.7.6',
      },
    },
  },
  gasReporter: {
    currency: process.env.COINMARKETCAP_DEFAULT_CURRENCY || 'USD',
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
    enabled: true,
    outputFile: 'gasReporterOutput.json',
    noColors: true,
  },
  preprocess: {
    eachLine: removeConsoleLog((hre) => hre.network.name !== 'hardhat'),
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
  typechain: {
    outDir: 'typechained',
    target: 'ethers-v5',
    externalArtifacts: ['node_modules/@openzeppelin/contracts/build/contracts/TimelockController.json'],
  },
};

if (process.env.TEST) {
  const solidity = config.solidity as MultiSolcUserConfig;
  solidity.compilers.forEach((_, i) => {
    solidity.compilers[i].settings! = {
      ...solidity.compilers[i].settings!,
      outputSelection: {
        '*': {
          '*': ['storageLayout'],
        },
      },
    };
  });
  config.solidity = solidity;
}

export default config;
