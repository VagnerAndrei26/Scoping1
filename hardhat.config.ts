import { HardhatUserConfig } from "hardhat/config";
// import * as tdly from "@tenderly/hardhat-tenderly";
// tdly.setup();

import "@nomicfoundation/hardhat-toolbox";
import "@nomiclabs/hardhat-vyper";
import "hardhat-gas-reporter"

import "./tasks";



const config: HardhatUserConfig = {
  networks: {
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    goerli: {
      url: "https://eth-goerli.g.alchemy.com/v2/sgaUcLMlmHdg9-vzH47QUgLALCXwj4wV",
      chainId: 5,
      accounts: process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    polygon: {
      url: "https://polygon-rpc.com",
      chainId: 137,
      accounts: process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    fantom: {
      url: "https://rpc.fantom.network",
      chainId: 250,
      accounts: process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    avax: {
      url: "https://api.avax.network/ext/bc/C/rpc",
      chainId: 43114,
      accounts: process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    optimism: {
      url: "https://mainnet.optimism.io",
      chainId: 10,
      accounts: process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    mainnet: {
      url: "https://ethereum.publicnode.com",
      chainId: 1,
      accounts: process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    arbitrum: {
      url: "https://arb1.arbitrum.io/rpc",
      chainId: 42161,
      accounts: process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
  },
  // tenderly: {
  //   project: "project",
  //   username: "bliiitz",
  // },

  mocha: {
    bail: false,
    allowUncaught: false,
    require: ['ts-node/register'],
    timeout: 30000,
    reporter: process.env.MOCHA_REPORTER ?? 'spec',
    reporterOptions: {
      mochaFile: 'testresult.xml',
    },
  },
  
  solidity: {
    compilers: [
      {
        version: "0.8.15",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1,
          },
        },
      },
      {
        version: "0.8.7",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1,
          },
        },
      }
    ]
    
  },
  vyper: {
    version: "0.2.8",
  },
  // gasReporter: {
  //   enabled: true,
  //   currency: 'USD',
  //   gasPrice: 20
  // },
  gasReporter: {
    enabled: (process.env.REPORT_GAS) ? true : false
  },
  etherscan: {
    apiKey: {
      goerli: process.env.ETHERSCAN_API_KEY || '',
      polygon: process.env.ETHERSCAN_API_KEY || '',
      opera: process.env.ETHERSCAN_API_KEY || '',
      avalanche: process.env.ETHERSCAN_API_KEY || '',
      optimism: process.env.ETHERSCAN_API_KEY || '',
      mainnet: process.env.ETHERSCAN_API_KEY || '',
      arbitrumOne: process.env.ETHERSCAN_API_KEY || '',
    },
  },
};

export default config;
