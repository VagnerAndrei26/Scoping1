import { ethers } from "hardhat";
import { assert, expect } from 'chai'
import { BigNumber } from 'ethers'
import { deployAaveMock, deployVaultFactory, IStrategAaveMockContracts, IStrategContracts, IStrategVaultFactoryContracts } from "../scripts/utils/deployer";

describe('StrategVault Contract', () => {

    before(async function (){
        const [owner, user] = await ethers.getSigners();
        this.owner = owner
        this.user = user
        
        const mock: IStrategAaveMockContracts = await deployAaveMock(owner)
        const factory: IStrategVaultFactoryContracts = await deployVaultFactory(owner.address, owner, [
            mock.StrategBlockAaveDepositMockContract.address,
            mock.StrategBlockHarvesterMockContract.address
        ]);
 
        let newVaultIndex = await factory.StrategVaultFactory.connect(this.user).vaultsLength();
        let tx = await factory.StrategVaultFactory.connect(this.owner).deployNewVault(
            "StrategVault: USDC", 
            "StratUSDC",
            mock.USDCTokenMockContract.address,
            BigNumber.from(100)
        )

        await tx.wait();
 
        this.contracts = {
            ...factory,
            ...mock
        };

        this.vault = await factory.StrategVaultFactory.connect(this.user).vaults(newVaultIndex);;
    });

    it('Setup strategy (onlyOwner)', async function () {
        const StrategVault = await ethers.getContractFactory("StrategVault");
        const contracts = <IStrategContracts>this.contracts
        const vault = StrategVault.attach(this.vault)

        const abiCoder = new ethers.utils.AbiCoder()
        
        let aaveParameters = abiCoder.encode(
            [ "tuple(address pool, uint256 tokenPercent, address token, address aToken)" ],
            [
                { 
                    pool: contracts.AaveMockContract.address, 
                    tokenPercent: BigNumber.from(100),
                    token: contracts.USDCTokenMockContract.address,
                    aToken: contracts.aUSDCMockContract.address
                }
            ]
        );

        let harvesterParameters = abiCoder.encode(
            [ "tuple(address token, uint256 amount, address dest)" ],
            [
                { 
                    token: contracts.aUSDCMockContract.address, 
                    amount: BigNumber.from("1000000000000000000000"),
                    dest: vault.address
                }
            ]
        );

        await expect(
            vault.connect(this.user).setStrat(
                [
                    0, //aave mock step
                ],
                [aaveParameters],
                [1],
                [harvesterParameters],
                [0],
                [aaveParameters],
            )
        ).to.be.revertedWith("Ownable: caller is not the owner");

        await vault.connect(this.owner).setStrat(
            [
                0, //aave mock step
            ],
            [aaveParameters],
            [1],
            [harvesterParameters],
            [
                0 //aave mock step
            ],
            [aaveParameters],
        )

        let strat = await vault.getStrat()

        // console.log(strat)

        assert(strat._stratBlocks[0] == contracts.StrategBlockAaveDepositMockContract.address)
        assert(strat._stratBlocksParameters[0] == aaveParameters)
    });

    it('Verify initial totalAsset and totalSupply = 0', async function () {
        const StrategVault = await ethers.getContractFactory("StrategVault");
        const contracts = <IStrategContracts>this.contracts
        const vault = StrategVault.attach(this.vault)

        let totalAsset = await vault.totalAssets()
        let totalSupply = await vault.totalSupply()

        assert(totalAsset.eq(BigNumber.from(0)))
        assert(totalSupply.eq(BigNumber.from(0)))
    });

    it('Deposit 10000 USDC (10000 shares)', async function () {
        const StrategVault = await ethers.getContractFactory("StrategVault");
        const contracts = <IStrategContracts>this.contracts
        const vault = StrategVault.attach(this.vault)

        await contracts.USDCTokenMockContract.connect(this.user).mint(this.user.address, "10000000000000000000000")
        await contracts.USDCTokenMockContract.connect(this.user).approve(vault.address, "10000000000000000000000")

        await vault.connect(this.user).deposit("10000000000000000000000", this.user.address)

        let usdcAmount = await contracts.USDCTokenMockContract.balanceOf(this.user.address)
        let vaultTokenAmount = await vault.balanceOf(this.user.address)
        let vaultUSDCAmount = await contracts.USDCTokenMockContract.balanceOf(vault.address)
        let vaultATokenAmount = await contracts.aUSDCMockContract.balanceOf(vault.address)
        let vaultTotalAssets = await vault.totalAssets()
        let vaultTotalSupply = await vault.totalSupply()

        assert(usdcAmount.eq(BigNumber.from("0")))
        assert(vaultTokenAmount.eq(BigNumber.from("10000000000000000000000")))
        assert(vaultUSDCAmount.eq(BigNumber.from("0")))
        assert(vaultATokenAmount.eq(BigNumber.from("10000000000000000000000")))
        assert(vaultTotalAssets.eq(BigNumber.from("10000000000000000000000")))
        assert(vaultTotalSupply.eq(BigNumber.from("10000000000000000000000")))
    });

    it('Verify initial totalAsset and totalSupply = 10000000000000000000000', async function () {
        const StrategVault = await ethers.getContractFactory("StrategVault");
        const contracts = <IStrategContracts>this.contracts
        const vault = StrategVault.attach(this.vault)

        let totalAsset = await vault.totalAssets()
        let totalSupply = await vault.totalSupply()

        assert(totalAsset.eq(BigNumber.from('10000000000000000000000')))
        assert(totalSupply.eq(BigNumber.from('10000000000000000000000')))
    });

    it('Withdraw 10000 shares (10000 USDC)', async function () {
        const StrategVault = await ethers.getContractFactory("StrategVault");
        const contracts = <IStrategContracts>this.contracts
        const vault = StrategVault.attach(this.vault)

        let tx = await vault.connect(this.user).withdraw("10000000000000000000000", this.user.address, this.user.address)

        let usdcAmount = await contracts.USDCTokenMockContract.balanceOf(this.user.address)
        let vaultTokenAmount = await vault.balanceOf(this.user.address)
        let vaultUSDCAmount = await contracts.USDCTokenMockContract.balanceOf(vault.address)
        let vaultATokenAmount = await contracts.aUSDCMockContract.balanceOf(vault.address)

        assert(usdcAmount.eq(BigNumber.from("10000000000000000000000")))
        assert(vaultTokenAmount.eq(BigNumber.from("0")))
        assert(vaultUSDCAmount.eq(BigNumber.from("0")))
        assert(vaultATokenAmount.eq(BigNumber.from("0")))
    });

    it('Deposit 10000 USDC (10000 shares)', async function () {
        const StrategVault = await ethers.getContractFactory("StrategVault");
        const contracts = <IStrategContracts>this.contracts
        const vault = StrategVault.attach(this.vault)

        await contracts.USDCTokenMockContract.connect(this.user).approve(vault.address, "10000000000000000000000")
        await vault.connect(this.user).deposit("10000000000000000000000", this.user.address)

        let usdcAmount = await contracts.USDCTokenMockContract.balanceOf(this.user.address)
        let vaultTokenAmount = await vault.balanceOf(this.user.address)
        let vaultUSDCAmount = await contracts.USDCTokenMockContract.balanceOf(vault.address)
        let vaultATokenAmount = await contracts.aUSDCMockContract.balanceOf(vault.address)
        let vaultTotalAssets = await vault.totalAssets()
        let vaultTotalSupply = await vault.totalSupply()

        assert(usdcAmount.eq(BigNumber.from("0")))
        assert(vaultTokenAmount.eq(BigNumber.from("10000000000000000000000")))
        assert(vaultUSDCAmount.eq(BigNumber.from("0")))
        assert(vaultATokenAmount.eq(BigNumber.from("10000000000000000000000")))
        assert(vaultTotalAssets.eq(BigNumber.from("10000000000000000000000")))
        assert(vaultTotalSupply.eq(BigNumber.from("10000000000000000000000")))
    });

    it('Harvest +1000 aSTRAT', async function () {
        const StrategVault = await ethers.getContractFactory("StrategVault");
        const contracts = <IStrategContracts>this.contracts
        const vault = StrategVault.attach(this.vault)

        await vault.connect(this.user).harvest()

        let usdcAmount = await contracts.USDCTokenMockContract.balanceOf(this.user.address)
        let vaultTokenAmount = await vault.balanceOf(this.user.address)
        let vaultUSDCAmount = await contracts.USDCTokenMockContract.balanceOf(vault.address)
        let vaultATokenAmount = await contracts.aUSDCMockContract.balanceOf(vault.address)
        let vaultTotalAssets = await vault.totalAssets()
        let vaultTotalSupply = await vault.totalSupply()

        assert(usdcAmount.eq(BigNumber.from("0")))
        assert(vaultTokenAmount.eq(BigNumber.from("10000000000000000000000")))
        assert(vaultUSDCAmount.eq(BigNumber.from("0")))
        assert(vaultATokenAmount.eq(BigNumber.from("10990000000000000000000")))
        assert(vaultTotalAssets.eq(BigNumber.from("10990000000000000000000")))
        assert(vaultTotalSupply.eq(BigNumber.from("10000000000000000000000")))
    });

    it('Withdraw 5000 shares (5500 USDC)', async function () {
        const StrategVault = await ethers.getContractFactory("StrategVault");
        const contracts = <IStrategContracts>this.contracts
        const vault = StrategVault.attach(this.vault)

        let tx = await vault.connect(this.user).redeem("5000000000000000000000", this.user.address, this.user.address)

        let usdcAmount = await contracts.USDCTokenMockContract.balanceOf(this.user.address)
        let vaultTokenAmount = await vault.balanceOf(this.user.address)
        let vaultUSDCAmount = await contracts.USDCTokenMockContract.balanceOf(vault.address)
        let vaultATokenAmount = await contracts.aUSDCMockContract.balanceOf(vault.address)

        assert(usdcAmount.eq(BigNumber.from("5495000000000000000000")))
        assert(vaultTokenAmount.eq(BigNumber.from("5000000000000000000000")))
        assert(vaultUSDCAmount.eq(BigNumber.from("0")))
        assert(vaultATokenAmount.eq(BigNumber.from("5495000000000000000000")))
    });

    it('Harvest +1000 aSTRAT', async function () {
        const StrategVault = await ethers.getContractFactory("StrategVault");
        const contracts = <IStrategContracts>this.contracts
        const vault = StrategVault.attach(this.vault)

        await vault.connect(this.user).harvest()

        let vaultATokenAmount = await contracts.aUSDCMockContract.balanceOf(vault.address)
        let vaultTotalAssets = await vault.totalAssets()
        let vaultTotalSupply = await vault.totalSupply()

        assert(vaultATokenAmount.eq(BigNumber.from("6485000000000000000000")))
        assert(vaultTotalAssets.eq(BigNumber.from("6485000000000000000000")))
        assert(vaultTotalSupply.eq(BigNumber.from("5000000000000000000000")))
    });

    it('Withdraw 5000 shares (6485 USDC)', async function () {
        const StrategVault = await ethers.getContractFactory("StrategVault");
        const contracts = <IStrategContracts>this.contracts
        const vault = StrategVault.attach(this.vault)

        let tx = await vault.connect(this.user).redeem("5000000000000000000000", this.user.address, this.user.address)

        let usdcAmount = await contracts.USDCTokenMockContract.balanceOf(this.user.address)
        let vaultTokenAmount = await vault.balanceOf(this.user.address)
        let vaultUSDCAmount = await contracts.USDCTokenMockContract.balanceOf(vault.address)
        let vaultATokenAmount = await contracts.aUSDCMockContract.balanceOf(vault.address)

        assert(usdcAmount.eq(BigNumber.from("5495000000000000000000").add(BigNumber.from('6485000000000000000000'))))
        assert(vaultTokenAmount.eq(BigNumber.from("0")))
        assert(vaultUSDCAmount.eq(BigNumber.from("0")))
        assert(vaultATokenAmount.eq(BigNumber.from("0")))
    });

    it('Check fees received', async function () {
        const StrategVault = await ethers.getContractFactory("StrategVault");
        const contracts = <IStrategContracts>this.contracts
        const vault = StrategVault.attach(this.vault)

        let usdcAmount = await contracts.USDCTokenMockContract.balanceOf(this.owner.address)

        assert(usdcAmount.eq(BigNumber.from("20000000000000000000")))
    });

})

