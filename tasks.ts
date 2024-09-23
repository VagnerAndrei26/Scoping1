

import { LedgerSigner } from "@anders-t/ethers-ledger";
import { task, types } from "hardhat/config";
import { readContractInfo, writeContractInfo } from "./libs/contractsInfo";
import { BigNumber } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

async function getDeployer(hre: HardhatRuntimeEnvironment): Promise<any> {
  let deployer
  switch (hre.network.name) {
    case 'localhost':
      [deployer] = await hre.ethers.getSigners()
      break

    case 'rinkeby':
    case 'kovan':
    case 'goerli':  
      deployer = new LedgerSigner(hre.ethers.provider);
      break;

    default:
      return
  }
  return deployer
}

task("new-vault", "Deploy new vault")
  .addParam(
    "name", 
    "ERC4626 token name", 
    "StrategVault",
    types.string  
  ) 
  .addParam(
    "symbol", 
    "ERC4626 token symbol", 
    "SVT",
    types.string  
  ) 
  .addParam(
    "asset", 
    "ERC4626 asset token", 
    undefined,
    types.string  
  ) 
  .addParam(
    "percentFees", 
    "Vault percent fees (10000 = 100%)", 
    100,
    types.int  
  ) 
  .setAction(async ({name, symbol, asset, percentFees}, hre) => {
    let contractsInfo = readContractInfo(hre.network.name)
    console.log(`${hre.network.name} chain contracts`)

    let registryAddr = contractsInfo['StrategStepRegistryContract'];
    if(!registryAddr) {
      console.log('StrategStepRegistryContract not deployed on this chain')
      return
    }

    let vaultFactoryAddr = contractsInfo['StrategVaultFactoryContract'];
    if(!vaultFactoryAddr) {
      console.log('StrategVaultFactory not deployed on this chain')
      return
    }

    let deployer = await getDeployer(hre)

    const StrategVaultFactory = await hre.ethers.getContractFactory("StrategVaultFactory");
    let vaultFactory = StrategVaultFactory.attach(vaultFactoryAddr)

    console.log('Deploying new vault on factory: ', vaultFactoryAddr)

    let tx = await vaultFactory.connect(deployer).deployNewVault(
      name,
      symbol,
      asset, //'0xA2025B15a1757311bfD68cb14eaeFCc237AF5b43',
      percentFees
    )

    let receipt = await tx.wait()

    let vaultAddr: string = ""
    let vaultOwner: string = ""
    for (const log of receipt.logs) {
      try {
        let l = StrategVaultFactory.interface.parseLog(log)
        if(l.name == "NewVault") {
          vaultAddr = l.args['addr']
          vaultOwner = l.args['owner']
        }
        console.log(l)
      } catch (error) {
      }
    }

    if(!vaultAddr) {
      console.error('Vault address not found')
      return
    }
    
    console.log('Vault deployed at ', vaultAddr)

    await hre.run("verify:verify", {
        address: vaultAddr,
        constructorArguments: [
          vaultOwner,
          registryAddr,
          name,
          symbol,
          asset,
          percentFees
        ],
    }); 
});

task("vault-deposit", "Deposit in vault")
  .addParam(
    "vault", 
    "Vault address", 
    undefined,
    types.string  
  ) 
  .addParam(
    "amount", 
    "Deposit amount", 
    undefined,
    types.string  
  ) 
  .setAction(async ({vault, amount}, hre) => {
    let contractsInfo = readContractInfo(hre.network.name)
    console.log(`${hre.network.name} chain contracts`)

    let registryAddr = contractsInfo['StrategStepRegistryContract'];
    if(!registryAddr) {
      console.log('StrategStepRegistryContract not deployed on this chain')
      return
    }

    let vaultFactoryAddr = contractsInfo['StrategVaultFactoryContract'];
    if(!vaultFactoryAddr) {
      console.log('StrategVaultFactory not deployed on this chain')
      return
    }

    let deployer = await getDeployer(hre)

    const StrategToken = await hre.ethers.getContractFactory("StrategToken");
    const StrategVault = await hre.ethers.getContractFactory("StrategVault");
    let Vault = StrategVault.attach(vault)

    let asset = StrategToken.attach(await Vault.connect(deployer).asset())

    let approveTx = await asset.connect(deployer).approve(vault, BigNumber.from(amount))
    await approveTx.wait()

    let depositTx = await Vault.connect(deployer).deposit(BigNumber.from(amount), await deployer.getAddress())
    await depositTx.wait()

    console.log(`Deposit transaction executed: ${depositTx.hash}`)
    

});

task("vault-withdraw", "Withdraw from vault")
  .addParam(
    "vault", 
    "Vault address", 
    undefined,
    types.string  
  ) 
  .addParam(
    "amount", 
    "Deposit amount", 
    undefined,
    types.string  
  ) 
  .setAction(async ({vault, amount}, hre) => {
    let contractsInfo = readContractInfo(hre.network.name)
    console.log(`${hre.network.name} chain contracts`)

    let registryAddr = contractsInfo['StrategStepRegistryContract'];
    if(!registryAddr) {
      console.log('StrategStepRegistryContract not deployed on this chain')
      return
    }

    let vaultFactoryAddr = contractsInfo['StrategVaultFactoryContract'];
    if(!vaultFactoryAddr) {
      console.log('StrategVaultFactory not deployed on this chain')
      return
    }

    let deployer = await getDeployer(hre)

    const StrategToken = await hre.ethers.getContractFactory("StrategToken");
    const StrategVault = await hre.ethers.getContractFactory("StrategVault");
    let Vault = StrategVault.attach(vault)

    let asset = StrategToken.attach(await Vault.connect(deployer).asset())

    let withdrawTx = await Vault.connect(deployer).withdraw(BigNumber.from(amount), await deployer.getAddress(), await deployer.getAddress())
    await withdrawTx.wait()

    console.log(`Deposit transaction executed: ${withdrawTx.hash}`)
    

});

task("set-test-aave-strat", "Deploy simple aave v3 vault strat")
  .addParam(
    "vault", 
    "Vault address", 
    undefined,
    types.string  
  )  
  .addParam(
    "lendingPool", 
    "LendingPool address", 
    "0x368EedF3f56ad10b9bC57eed4Dac65B26Bb667f6",
    types.string  
  ) 
  .addParam(
    "token", 
    "ERC20 token address of underlying asset", 
    '0xA2025B15a1757311bfD68cb14eaeFCc237AF5b43',
    types.string  
  ) 
  .addParam(
    "aToken", 
    "ERC20 Aave bearing token address", 
    '0x1Ee669290939f8a8864497Af3BC83728715265FF',
    types.string  
  ) 
  .setAction(async ({vault, lendingPool, token, aToken}, hre) => {
    let contractsInfo = readContractInfo(hre.network.name)
    console.log(`${hre.network.name} chain contracts`)

    const StrategVault = await hre.ethers.getContractFactory("StrategVault");
    let Vault = StrategVault.attach(vault)
    const abiCoder = new hre.ethers.utils.AbiCoder()

    let deployer = await getDeployer(hre)

    let aaveParameters = abiCoder.encode(
      [ "tuple(address lendingPool, uint256 tokenInPercent, address token, address aToken)" ],
      [
          { 
              lendingPool, 
              tokenInPercent: BigNumber.from('100'),
              token,
              aToken
          }
      ]
    );

    console.log(`Send setStrat tx`)
    let setStratTx = await Vault.connect(deployer).setStrat(
      [1],  //aave mock step
      [aaveParameters],
      [],
      [],
      [1],//aave mock step
      [aaveParameters],
      // { gasLimit: 3000000 }
    )

    let tx = await setStratTx.wait()
    console.log(tx)

    console.log(`SetStrat transaction executed: ${setStratTx.hash}`)
});

task("claim-test-aave-usdc", "Claim")
  .setAction(async ({vault, lendingPool, token, aToken}, hre) => {
    let contractsInfo = readContractInfo(hre.network.name)
    console.log(`${hre.network.name} chain contracts`)

    const mintAbi = [
      "function mint(address _to, uint256 _amount) external",
    ];

    let deployer = await getDeployer(hre)

    let claimContract = new hre.ethers.Contract('0x1ca525cd5cb77db5fa9cbba02a0824e283469dbe', mintAbi, hre.ethers.provider);
    let claimTx = await claimContract.connect(deployer).mint('0xA2025B15a1757311bfD68cb14eaeFCc237AF5b43', '10000000000')
    await claimTx.wait()
});

task("vault-info", "Deploy simple aave v3 vault strat")
  .addParam(
    "vault", 
    "Vault address", 
    undefined,
    types.string  
  )  
  .setAction(async ({vault, lendingPool, token, aToken}, hre) => {
    let contractsInfo = readContractInfo(hre.network.name)
    console.log(`${hre.network.name} chain contracts`)

    let deployer = await getDeployer(hre)

    const StrategVault = await hre.ethers.getContractFactory("StrategVault");
    let Vault = StrategVault.attach(vault)

    
    let vaultName = await Vault.connect(deployer).name()
    let vaultSymbol = await Vault.connect(deployer).symbol()
    let vaultTotalSupply = await Vault.connect(deployer).totalSupply()
    let vaultTotalAsset = await Vault.connect(deployer).totalAssets()

    const StrategToken = await hre.ethers.getContractFactory("StrategToken");
    let asset = StrategToken.attach(await Vault.connect(deployer).asset())
    let aasset = StrategToken.attach('0x1Ee669290939f8a8864497Af3BC83728715265FF')

    let balanceOfAsset = await asset.connect(deployer).balanceOf(vault)
    let balanceOfaAsset = await aasset.connect(deployer).balanceOf(vault)

    console.log(`Vault info (${vault}):`)
    console.log(`  - name (${vaultName})`)
    console.log(`  - symbol (${vaultSymbol})`)
    console.log(`  - total supply (${vaultTotalSupply})`)
    console.log(`  - total assets (${vaultTotalAsset})`)
    console.log(`  - asset balance (${balanceOfAsset})`)
    console.log(`  - aasset balance (${balanceOfaAsset})`)
});
