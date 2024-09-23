// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ethers, network, config } from "hardhat";
import { LedgerSigner } from "@anders-t/ethers-ledger";
import * as fs from "fs";
import { BigNumber } from "ethers";
import { deployAaveMock, deployVaultFactory,  } from "./utils/deployer";


async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  // We get the contract to deploy
  
  let deployer: any, fee, feeCollector, feeCollectorSigner, mockTokens, mockBlocks: any
  switch (network.name) {
    case 'localhost':
      [deployer, feeCollectorSigner] = await ethers.getSigners()
      feeCollector = feeCollectorSigner.address
      fee =	BigNumber.from("100");
      mockTokens = await deployAaveMock(deployer)
      break

    case 'goerli':
      deployer = new LedgerSigner(ethers.provider);
      fee =	BigNumber.from("100");
      feeCollector = await deployer.getAddress()
      break;

    case 'optimism':
      deployer = new LedgerSigner(ethers.provider);
      fee =	BigNumber.from("100");
      feeCollector = await deployer.getAddress()
      break;

    case 'polygon':
      deployer = new LedgerSigner(ethers.provider);
      fee =	BigNumber.from("100");
      feeCollector = await deployer.getAddress()
      break;

    case 'matic':
      deployer = new LedgerSigner(ethers.provider);
      fee =	BigNumber.from("100");
      feeCollector = await deployer.getAddress()
      break;

    case 'fantom':
      deployer = new LedgerSigner(ethers.provider);
      fee =	BigNumber.from("100");
      feeCollector = await deployer.getAddress()
      break;

    case 'avax':
      deployer = new LedgerSigner(ethers.provider);
      fee =	BigNumber.from("100");
      feeCollector = await deployer.getAddress()
      break;

    case 'arbitrum':
      deployer = new LedgerSigner(ethers.provider);
      fee =	BigNumber.from("100");
      feeCollector = await deployer.getAddress()
      break;

    default:
      return
  }

  let vaultFactoryContract = await deployVaultFactory(
    feeCollector,
    deployer,
    []
  )

  
  if(network.name == 'localhost'){
    console.log("Mint mock token on: ", deployer.address)
    await mockTokens?.USDCTokenMockContract.mint(deployer.address, "1000000000000000000000000")
    await mockTokens?.USDTTokenMockContract.mint(deployer.address, "1000000000000000000000000")
    await mockBlocks?.AaveDepositMockContract.setAToken(mockTokens?.USDCTokenMockContract.address, mockTokens?.aUSDCMockContract.address)
    await mockBlocks?.AaveMockContract.setAToken(mockTokens?.USDTTokenMockContract.address, mockTokens?.aUSDTMockContract.address)
  }
  
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
