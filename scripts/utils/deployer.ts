import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ethers, run } from "hardhat";
import { LedgerSigner } from "@anders-t/ethers-ledger";

import { 
    StrategBlockRegistry, 
    StrategVaultFactory, 
    AaveMock,
    USDCTokenMock, 
    USDTTokenMock,
    AUSDCMock, 
    AUSDTMock, 
    StrategBlockAaveDepositMock,
    StrategBlockHarvesterMock
} from "../../typechain-types";

const DEBUG = false


async function deployAaveMock(
    deployer: LedgerSigner | SignerWithAddress,
): Promise<IStrategAaveMockContracts> {

    const USDCTokenMock = await ethers.getContractFactory("USDCTokenMock");
    const USDCTokenMockContract  = await USDCTokenMock.connect(deployer).deploy();
    await USDCTokenMockContract.deployTransaction.wait()

    const USDTTokenMock = await ethers.getContractFactory("USDTTokenMock");
    const USDTTokenMockContract  = await USDTTokenMock.connect(deployer).deploy();
    await USDTTokenMockContract.deployTransaction.wait()


    const aUSDCMock = await ethers.getContractFactory("aUSDCMock");
    const aUSDCMockContract  = await <Promise<AUSDCMock>>aUSDCMock.connect(deployer).deploy();
    await aUSDCMockContract.deployTransaction.wait()


    const aUSDTMock = await ethers.getContractFactory("aUSDTMock");
    const aUSDTMockContract  = await <Promise<AUSDTMock>>aUSDTMock.connect(deployer).deploy();
    await aUSDTMockContract.deployTransaction.wait()

    const AaveMock = await ethers.getContractFactory("AaveMock");
    const AaveMockContract  = await AaveMock.connect(deployer).deploy({ gasPrice: 50000000000 });
    await AaveMockContract.deployTransaction.wait()

    const StrategBlockHarvesterMock = await ethers.getContractFactory("StrategBlockHarvesterMock");
    const StrategBlockHarvesterMockContract  = await StrategBlockHarvesterMock.connect(deployer).deploy({ gasPrice: 50000000000 });
    await StrategBlockHarvesterMockContract.deployTransaction.wait()

    const StrategBlockAaveDepositMock = await ethers.getContractFactory("StrategBlockAaveDepositMock");
    const StrategBlockAaveDepositMockContract = await StrategBlockAaveDepositMock.connect(deployer).deploy({ gasPrice: 50000000000 });
    await StrategBlockAaveDepositMockContract.deployTransaction.wait()

    await AaveMockContract.setAToken(USDCTokenMockContract.address, aUSDCMockContract.address)
    await AaveMockContract.setAToken(USDTTokenMockContract.address, aUSDTMockContract.address)

    return {
        AaveMockContract,
        StrategBlockAaveDepositMockContract,
        StrategBlockHarvesterMockContract,
        USDCTokenMockContract,
        USDTTokenMockContract,
        aUSDCMockContract,
        aUSDTMockContract,
    }
}

async function deployVaultFactory(
    feeCollector: string,
    deployer: LedgerSigner | SignerWithAddress,
    initialBlocks: string[]
): Promise<IStrategVaultFactoryContracts> {

    const StrategBlockRegistry = await ethers.getContractFactory("StrategBlockRegistry");
    let StrategBlockRegistryContract  = await StrategBlockRegistry.connect(deployer).deploy(initialBlocks, { gasPrice: 50000000000 });
    await StrategBlockRegistryContract.deployTransaction.wait()

    const StrategVaultFactory = await ethers.getContractFactory("StrategVaultFactory");
    let StrategVaultFactoryContract  = await StrategVaultFactory.connect(deployer).deploy(StrategBlockRegistryContract.address, feeCollector, { gasPrice: 50000000000 });
    await StrategVaultFactoryContract.deployTransaction.wait()

    return {
        StrategBlockRegistry: StrategBlockRegistryContract,
        StrategVaultFactory: StrategVaultFactoryContract
    }
}


interface IStrategContracts extends IStrategAaveMockContracts, IStrategVaultFactoryContracts {}

interface IStrategVaultFactoryContracts {
    StrategBlockRegistry: StrategBlockRegistry
    StrategVaultFactory: StrategVaultFactory
}

interface IStrategAaveMockContracts {
    AaveMockContract: AaveMock
    StrategBlockAaveDepositMockContract: StrategBlockAaveDepositMock
    StrategBlockHarvesterMockContract: StrategBlockHarvesterMock
    USDCTokenMockContract: USDCTokenMock
    USDTTokenMockContract: USDTTokenMock
    aUSDCMockContract: AUSDCMock
    aUSDTMockContract: AUSDTMock
}

export {
    IStrategContracts,
    IStrategVaultFactoryContracts,
    IStrategAaveMockContracts,
    deployAaveMock,
    deployVaultFactory,
}