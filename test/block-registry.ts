import { ethers } from "hardhat";
import { assert, expect } from 'chai'
import { BigNumber } from 'ethers'
import { deployAaveMock, deployVaultFactory, IStrategVaultFactoryContracts } from "../scripts/utils/deployer";


describe('StrategBlockRegistry Contract', () => {

    before(async function (){
        const [owner, user, fakeBlock0, fakeBlock1, fakeBlock2, fakeBlock3] = await ethers.getSigners();
        this.owner = owner
        this.user = user
        this.fakeBlock0 = fakeBlock0
        this.fakeBlock1 = fakeBlock1
        this.fakeBlock2 = fakeBlock2
        this.fakeBlock3 = fakeBlock3
        
        const contracts: IStrategVaultFactoryContracts = await deployVaultFactory(owner.address, owner, []);

        this.contracts = contracts;
    });

    it('Non owner can\'t add steps', async function () {
        const contracts = <IStrategVaultFactoryContracts>this.contracts

        await expect(
            contracts.StrategBlockRegistry.connect(this.user).addBlocks([
                this.fakeBlock0.address,
                this.fakeBlock1.address
            ])
        ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it('Owner can add steps', async function () {
        const contracts = <IStrategVaultFactoryContracts>this.contracts

        await contracts.StrategBlockRegistry.connect(this.owner).addBlocks([
            this.fakeBlock0.address,
            this.fakeBlock1.address
        ])

        let strat0 = await contracts.StrategBlockRegistry.blocks(0);
        let strat1 = await contracts.StrategBlockRegistry.blocks(1);

        assert(strat0 == this.fakeBlock0.address, 'strat0 != fakeBlock0')
        assert(strat1 == this.fakeBlock1.address, 'strat1 != fakeBlock1')
    });

    it('Verify blocksLength', async function () {
        const contracts = <IStrategVaultFactoryContracts>this.contracts
        let length = await contracts.StrategBlockRegistry.blocksLength()
        assert(length.eq(BigNumber.from(2)), 'error in blocksLength')
    });

    it('Get blocks batch', async function () {
        const contracts = <IStrategVaultFactoryContracts>this.contracts
        let blocks = await contracts.StrategBlockRegistry.getBlocks([0,1])

        assert(blocks[0] == this.fakeBlock0.address, 'blocks[0] != fakeBlock0')
        assert(blocks[1] == this.fakeBlock1.address, 'blocks[1] != fakeBlock1')
    });

    it('Get blocks revert when step not exists', async function () {
        const contracts = <IStrategVaultFactoryContracts>this.contracts

        await expect(
            contracts.StrategBlockRegistry.getBlocks([0,1,2])
        ).to.be.revertedWith("2 step unknown");
    });

    it('Owner can add blocks multiple time', async function () {
        const contracts = <IStrategVaultFactoryContracts>this.contracts

        await contracts.StrategBlockRegistry.connect(this.owner).addBlocks([
            this.fakeBlock2.address,
            this.fakeBlock3.address
        ])

        let strat0 = await contracts.StrategBlockRegistry.blocks(0);
        let strat1 = await contracts.StrategBlockRegistry.blocks(1);

        assert(strat0 == this.fakeBlock0.address, 'strat0 != fakeBlock0')
        assert(strat1 == this.fakeBlock1.address, 'strat1 != fakeBlock1')
    });

    it('Get blocks batch after multiple add', async function () {
        const contracts = <IStrategVaultFactoryContracts>this.contracts
        let blocks = await contracts.StrategBlockRegistry.getBlocks([0,1,2,3])

        assert(blocks[0] == this.fakeBlock0.address, 'blocks[0] != fakeBlock0')
        assert(blocks[1] == this.fakeBlock1.address, 'blocks[1] != fakeBlock1')
        assert(blocks[2] == this.fakeBlock2.address, 'blocks[2] != fakeBlock2')
        assert(blocks[3] == this.fakeBlock3.address, 'blocks[3] != fakeBlock3')
    });

    it('Verify blocksLength after multiple add', async function () {
        const contracts = <IStrategVaultFactoryContracts>this.contracts
        let length = await contracts.StrategBlockRegistry.blocksLength()
        assert(length.eq(BigNumber.from(4)), 'error in blocksLength')
    });
})
