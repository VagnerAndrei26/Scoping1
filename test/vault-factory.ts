import { ethers } from "hardhat";
import { assert, expect } from 'chai'
import { BigNumber } from 'ethers'
import { deployAaveMock, deployVaultFactory, IStrategAaveMockContracts, IStrategContracts, IStrategVaultFactoryContracts } from "../scripts/utils/deployer";
import { StrategVault } from "../typechain-types";

describe('StrategVaultFactory Contract', () => {

    before(async function (){
        const [owner, user] = await ethers.getSigners();
        this.owner = owner
        this.user = user

        
        const mock: IStrategAaveMockContracts = await deployAaveMock(owner)
        const factory: IStrategVaultFactoryContracts = await deployVaultFactory(owner.address, owner, [mock.StrategBlockAaveDepositMockContract.address]);
 
        this.contracts = {
            ...mock,
            ...factory
        };
    });

    it('User can deploy vault', async function () {
        const contracts = <IStrategContracts>this.contracts

        let newVaultIndex = await contracts.StrategVaultFactory.connect(this.user).vaultsLength();
        let tx = await contracts.StrategVaultFactory.connect(this.user).deployNewVault(
            "StrategVault: USDC", 
            "StratUSDC",
            contracts.USDCTokenMockContract.address,
            BigNumber.from(100)
        )

        await tx.wait();

        let vaultAddr = await contracts.StrategVaultFactory.vaults(newVaultIndex);
        assert(vaultAddr !== ethers.constants.AddressZero)

        const StrategVault = await ethers.getContractFactory("StrategVault");

        this.vault = StrategVault.attach(vaultAddr);
    });

    it('Verify vault owner', async function () {
        const contracts = <IStrategVaultFactoryContracts>this.contracts
        const vault = <StrategVault>this.vault

        let vaultOwner = await vault.owner()
        assert(vaultOwner == this.user.address, "Bad owner set")
    });

    it('Verify getOwnedVaultBy()', async function () {
        const contracts = <IStrategVaultFactoryContracts>this.contracts
        const vault = <StrategVault>this.vault

        let ownedVault = await contracts.StrategVaultFactory.getOwnedVaultBy(this.user.address)
        assert(ownedVault[0].eq(BigNumber.from(0)), "Bad owner set")
    });

    it('Verify getBatchVaultAddresses()', async function () {
        const contracts = <IStrategVaultFactoryContracts>this.contracts
        const vault = <StrategVault>this.vault

        let vaults = await contracts.StrategVaultFactory.getBatchVaultAddresses([0])
        assert(vaults[0] == this.vault.address, "Bad vault address")
    });
})
