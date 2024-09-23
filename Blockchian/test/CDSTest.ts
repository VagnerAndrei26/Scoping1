const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { it } = require("mocha")
import { ethers,upgrades } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { describe } from "node:test";
import { BorrowLib } from "../typechain-types";
import { Contract, ContractFactory, ZeroAddress } from 'ethers'
import { Options } from '@layerzerolabs/lz-v2-utilities'

import {
    wethGatewayMainnet,
    priceFeedAddressEthToUsdMainnet,priceFeedAddressWeEthToEthMainnet,
    priceFeedAddressRsEthToEthMainnet,
    aTokenAddressMainnet,
    aavePoolAddressMainnet,
    cometMainnet,
    INFURA_URL_MAINNET,
    aTokenABI,
    cETH_ABI,
    wethAddressMainnet,
    endPointAddressMainnet,endPointAddressBase,
    ethAddressMainnet,
    etherFiDepositAddressMainnet,
    etherFiDepositABI,
    kelpDaoDepositAddressMainnet,
    kelpDaoDepositABI,
    } from "./utils/index"

describe("CDS Contract",function(){

    let owner: any;
    let owner1: any;
    let owner2: any;
    let user1: any;
    let user2: any;
    let user3: any;

    const eidA = 1
    const eidB = 2
    const eidC = 3
    const ethVolatility = 50622665;


    async function deployer(){
        [owner,owner1,owner2,user1,user2,user3] = await ethers.getSigners();

        const EndpointV2Mock = await ethers.getContractFactory('EndpointV2Mock')
        const mockEndpointV2A = await EndpointV2Mock.deploy(eidA)
        const mockEndpointV2B = await EndpointV2Mock.deploy(eidB)
        const mockEndpointV2C = await EndpointV2Mock.deploy(eidC)

        const weETH = await ethers.getContractFactory("WEETH");
        const weETHA = await upgrades.deployProxy(weETH,[
            await mockEndpointV2A.getAddress(),
            await owner.getAddress()],{initializer:'initialize',kind:'uups'});

        const weETHB = await upgrades.deployProxy(weETH,[
            await mockEndpointV2B.getAddress(),
            await owner.getAddress()],{initializer:'initialize',kind:'uups'});

        const rsETH = await ethers.getContractFactory("RSETH");
        const rsETHA = await upgrades.deployProxy(rsETH,[
            await mockEndpointV2A.getAddress(),
            await owner.getAddress()],{initializer:'initialize',kind:'uups'});

        const rsETHB = await upgrades.deployProxy(rsETH,[
            await mockEndpointV2B.getAddress(),
            await owner.getAddress()],{initializer:'initialize',kind:'uups'});

        const USDaStablecoin = await ethers.getContractFactory("TestUSDaStablecoin");
        const TokenA = await upgrades.deployProxy(USDaStablecoin,[
            await mockEndpointV2A.getAddress(),
            await owner.getAddress()],{initializer:'initialize',kind:'uups'});

        const TokenB = await upgrades.deployProxy(USDaStablecoin,[
            await mockEndpointV2B.getAddress(),
            await owner.getAddress()],{initializer:'initialize',kind:'uups'});

        const TokenC = await upgrades.deployProxy(USDaStablecoin,[
            await mockEndpointV2B.getAddress(),
            await owner.getAddress()],{initializer:'initialize',kind:'uups'});

        const ABONDToken = await ethers.getContractFactory("TestABONDToken");
        const abondTokenA = await upgrades.deployProxy(ABONDToken, {initializer: 'initialize',kind:'uups'});
        const abondTokenB = await upgrades.deployProxy(ABONDToken, {initializer: 'initialize',kind:'uups'});

        const MultiSign = await ethers.getContractFactory("MultiSign");
        const multiSignA = await upgrades.deployProxy(MultiSign,[[await owner.getAddress(),await owner1.getAddress(),await owner2.getAddress()],2],{initializer:'initialize',kind:'uups'});
        const multiSignB = await upgrades.deployProxy(MultiSign,[[await owner.getAddress(),await owner1.getAddress(),await owner2.getAddress()],2],{initializer:'initialize',kind:'uups'});

        const USDTToken = await ethers.getContractFactory("TestUSDT");
        const usdtA = await upgrades.deployProxy(USDTToken,[
            await mockEndpointV2A.getAddress(),
            await owner.getAddress()],{initializer:'initialize',kind:'uups'});
        const usdtB = await upgrades.deployProxy(USDTToken,[
            await mockEndpointV2B.getAddress(),
            await owner.getAddress()],{initializer:'initialize',kind:'uups'});

        const MockPriceFeed = await ethers.getContractFactory("MockV3Aggregator");
        const mockPriceFeedA = await MockPriceFeed.deploy(8,100000000000);
        const mockPriceFeedB = await MockPriceFeed.deploy(8,100000000000);

        // const priceFeedAddressMainnetA = await mockPriceFeedA.getAddress();
        // const priceFeedAddressMainnetB = await mockPriceFeedB.getAddress();

        const cdsLibFactory = await ethers.getContractFactory("CDSLib");
        const cdsLib = await cdsLibFactory.deploy();

        const CDS = await ethers.getContractFactory("CDSTest",{
            libraries: {
                CDSLib:await cdsLib.getAddress()
            }
        });
        const CDSContractA = await upgrades.deployProxy(CDS,[
            await TokenA.getAddress(),
            priceFeedAddressEthToUsdMainnet,
            await usdtA.getAddress(),
            await multiSignA.getAddress()
        ],{initializer:'initialize',
            unsafeAllowLinkedLibraries:true
        ,kind:'uups'})

        const CDSContractB = await upgrades.deployProxy(CDS,[
            await TokenB.getAddress(),
            priceFeedAddressEthToUsdMainnet,
            await usdtB.getAddress(),
            await multiSignB.getAddress()
        ],{initializer:'initialize',
            unsafeAllowLinkedLibraries:true
        ,kind:'uups'})

        const GlobalVariables = await ethers.getContractFactory("GlobalVariables");
        const globalVariablesA = await upgrades.deployProxy(GlobalVariables,[
            await TokenA.getAddress(),
            await CDSContractA.getAddress(),
            await mockEndpointV2A.getAddress(),
            await owner.getAddress()],{initializer:'initialize',kind:'uups'});

        const globalVariablesB = await upgrades.deployProxy(GlobalVariables,[
            await TokenB.getAddress(),
            await CDSContractB.getAddress(),
            await mockEndpointV2B.getAddress(),
            await owner.getAddress()],{initializer:'initialize',kind:'uups'});

        const borrowLibFactory = await ethers.getContractFactory("BorrowLib");
        const borrowLib = await borrowLibFactory.deploy();

        const Borrowing = await ethers.getContractFactory("BorrowingTest",{
            libraries: {
                BorrowLib:await borrowLib.getAddress()
            }
        });

        const BorrowingContractA = await upgrades.deployProxy(Borrowing,[
            await TokenA.getAddress(),
            await CDSContractA.getAddress(),
            await abondTokenA.getAddress(),
            await multiSignA.getAddress(),
            [priceFeedAddressEthToUsdMainnet,
            priceFeedAddressWeEthToEthMainnet,
            priceFeedAddressRsEthToEthMainnet],
            [ethAddressMainnet,await weETHA.getAddress(),await rsETHA.getAddress()],
            [await TokenA.getAddress(), await abondTokenA.getAddress(), await usdtA.getAddress()],
            1,
            await globalVariablesA.getAddress()
        ],{initializer:'initialize',
            unsafeAllowLinkedLibraries:true
        ,kind:'uups'});

        const BorrowingContractB = await upgrades.deployProxy(Borrowing,[
            await TokenB.getAddress(),
            await CDSContractB.getAddress(),
            await abondTokenB.getAddress(),
            await multiSignB.getAddress(),
            [priceFeedAddressEthToUsdMainnet,
            priceFeedAddressWeEthToEthMainnet,
            priceFeedAddressRsEthToEthMainnet],
            [ethAddressMainnet,await weETHB.getAddress(),await rsETHB.getAddress()],
            [await TokenB.getAddress(), await abondTokenB.getAddress(), await usdtB.getAddress()],            
            1,
            await globalVariablesB.getAddress()
        ],{initializer:'initialize',
            unsafeAllowLinkedLibraries:true
        ,kind:'uups'});

        const BorrowLiq = await ethers.getContractFactory("BorrowLiquidation",{
            libraries: {
                BorrowLib:await borrowLib.getAddress()
            }
        });

        const BorrowingLiquidationA = await upgrades.deployProxy(BorrowLiq,[
            await BorrowingContractA.getAddress(),
            await CDSContractA.getAddress(),
            await TokenA.getAddress(),
            await globalVariablesA.getAddress()
        ],{initializer:'initialize',
            unsafeAllowLinkedLibraries:true
        ,kind:'uups'}); 

        const BorrowingLiquidationB = await upgrades.deployProxy(BorrowLiq,[
            await BorrowingContractB.getAddress(),
            await CDSContractB.getAddress(),
            await TokenB.getAddress(),
            await globalVariablesB.getAddress()
        ],{initializer:'initialize',
            unsafeAllowLinkedLibraries:true
        ,kind:'uups'}); 

        const Treasury = await ethers.getContractFactory("Treasury");
        const treasuryA = await upgrades.deployProxy(Treasury,[
            await BorrowingContractA.getAddress(),
            await TokenA.getAddress(),
            await abondTokenA.getAddress(),
            await CDSContractA.getAddress(),
            await BorrowingLiquidationA.getAddress(),
            await usdtA.getAddress(),
            await globalVariablesA.getAddress()
        ],{initializer:'initialize',kind:'uups'});

        const treasuryB = await upgrades.deployProxy(Treasury,[
            await BorrowingContractB.getAddress(),
            await TokenB.getAddress(),
            await abondTokenB.getAddress(),
            await CDSContractB.getAddress(),
            await BorrowingLiquidationB.getAddress(),
            await usdtB.getAddress(),
            await globalVariablesB.getAddress()
        ],{initializer:'initialize',kind:'uups'});

        const Option = await ethers.getContractFactory("Options");
        const optionsA = await upgrades.deployProxy(Option,[
            await treasuryA.getAddress(),
            await CDSContractA.getAddress(),
            await BorrowingContractA.getAddress(),
            await globalVariablesA.getAddress()
        ],{initializer:'initialize',kind:'uups'});
        const optionsB = await upgrades.deployProxy(Option,[
            await treasuryB.getAddress(),
            await CDSContractB.getAddress(),
            await BorrowingContractB.getAddress(),
            await globalVariablesB.getAddress()
        ],{initializer:'initialize',kind:'uups'});

        await mockEndpointV2A.setDestLzEndpoint(await TokenB.getAddress(), mockEndpointV2B.getAddress())
        await mockEndpointV2A.setDestLzEndpoint(await TokenC.getAddress(), mockEndpointV2C.getAddress())
        await mockEndpointV2B.setDestLzEndpoint(await TokenA.getAddress(), mockEndpointV2A.getAddress())
        await mockEndpointV2B.setDestLzEndpoint(await TokenC.getAddress(), mockEndpointV2C.getAddress())
        await mockEndpointV2C.setDestLzEndpoint(await TokenA.getAddress(), mockEndpointV2A.getAddress())
        await mockEndpointV2C.setDestLzEndpoint(await TokenB.getAddress(), mockEndpointV2B.getAddress())

        await mockEndpointV2B.setDestLzEndpoint(await usdtA.getAddress(), mockEndpointV2A.getAddress())
        await mockEndpointV2A.setDestLzEndpoint(await usdtB.getAddress(), mockEndpointV2B.getAddress())

        await mockEndpointV2B.setDestLzEndpoint(await weETHA.getAddress(), mockEndpointV2A.getAddress())
        await mockEndpointV2A.setDestLzEndpoint(await weETHB.getAddress(), mockEndpointV2B.getAddress())

        await mockEndpointV2B.setDestLzEndpoint(await rsETHA.getAddress(), mockEndpointV2A.getAddress())
        await mockEndpointV2A.setDestLzEndpoint(await rsETHB.getAddress(), mockEndpointV2B.getAddress())

        await mockEndpointV2A.setDestLzEndpoint(await globalVariablesB.getAddress(), mockEndpointV2B.getAddress())
        await mockEndpointV2B.setDestLzEndpoint(await globalVariablesA.getAddress(), mockEndpointV2A.getAddress())

        await TokenA.setPeer(eidB, ethers.zeroPadValue(await TokenB.getAddress(), 32))
        await TokenA.setPeer(eidC, ethers.zeroPadValue(await TokenC.getAddress(), 32))
        await TokenB.setPeer(eidA, ethers.zeroPadValue(await TokenA.getAddress(), 32))
        await TokenB.setPeer(eidC, ethers.zeroPadValue(await TokenC.getAddress(), 32))
        await TokenC.setPeer(eidA, ethers.zeroPadValue(await TokenA.getAddress(), 32))
        await TokenC.setPeer(eidB, ethers.zeroPadValue(await TokenB.getAddress(), 32))

        await usdtA.setPeer(eidB, ethers.zeroPadValue(await usdtB.getAddress(), 32))
        await usdtB.setPeer(eidA, ethers.zeroPadValue(await usdtA.getAddress(), 32))

        await weETHA.setPeer(eidB, ethers.zeroPadValue(await weETHB.getAddress(), 32))
        await weETHB.setPeer(eidA, ethers.zeroPadValue(await weETHA.getAddress(), 32))

        await rsETHA.setPeer(eidB, ethers.zeroPadValue(await rsETHB.getAddress(), 32))
        await rsETHB.setPeer(eidA, ethers.zeroPadValue(await rsETHA.getAddress(), 32))

        await globalVariablesA.setPeer(eidB, ethers.zeroPadValue(await globalVariablesB.getAddress(), 32))
        await globalVariablesB.setPeer(eidA, ethers.zeroPadValue(await globalVariablesA.getAddress(), 32))

        await abondTokenA.setBorrowingContract(await BorrowingContractA.getAddress());
        await abondTokenB.setBorrowingContract(await BorrowingContractB.getAddress());

        await multiSignA.approveSetterFunction([0,1,3,4,5,6,7,8,9]);
        await multiSignA.connect(owner1).approveSetterFunction([0,1,3,4,5,6,7,8,9]);
        await multiSignB.approveSetterFunction([0,1,3,4,5,6,7,8,9]);
        await multiSignB.connect(owner1).approveSetterFunction([0,1,3,4,5,6,7,8,9]);

        await BorrowingContractA.setAdmin(owner.getAddress());
        await BorrowingContractB.setAdmin(owner.getAddress());

        await CDSContractA.setAdmin(owner.getAddress());
        await CDSContractB.setAdmin(owner.getAddress());

        await TokenA.setDstEid(eidB);
        await TokenB.setDstEid(eidA);

        await usdtA.setDstEid(eidB);
        await usdtB.setDstEid(eidA);

        await globalVariablesA.setDstEid(eidB);
        await globalVariablesB.setDstEid(eidA);

        await globalVariablesA.setDstGlobalVariablesAddress(await globalVariablesB.getAddress());
        await globalVariablesB.setDstGlobalVariablesAddress(await globalVariablesA.getAddress());

        await globalVariablesA.setTreasury(await treasuryA.getAddress());
        await globalVariablesB.setTreasury(await treasuryB.getAddress());

        await globalVariablesA.setBorrowLiq(await BorrowingLiquidationA.getAddress());
        await globalVariablesB.setBorrowLiq(await BorrowingLiquidationB.getAddress());        
        
        await globalVariablesA.setBorrowing(await BorrowingContractA.getAddress());
        await globalVariablesB.setBorrowing(await BorrowingContractB.getAddress());

        await BorrowingContractA.setTreasury(await treasuryA.getAddress());
        await BorrowingContractA.setOptions(await optionsA.getAddress());
        await BorrowingContractA.setBorrowLiquidation(await BorrowingLiquidationA.getAddress());
        await BorrowingContractA.setLTV(80);
        await BorrowingContractA.setBondRatio(4);
        await BorrowingContractA.setAPR(50,BigInt("1000000001547125957863212448"));

        await BorrowingContractB.setTreasury(await treasuryB.getAddress());
        await BorrowingContractB.setOptions(await optionsB.getAddress());
        await BorrowingContractB.setBorrowLiquidation(await BorrowingLiquidationB.getAddress());
        await BorrowingContractB.setLTV(80);
        await BorrowingContractB.setBondRatio(4);
        await BorrowingContractB.setAPR(50,BigInt("1000000001547125957863212448"));

        await BorrowingLiquidationA.setTreasury(await treasuryA.getAddress());
        await BorrowingLiquidationB.setTreasury(await treasuryB.getAddress());

        await BorrowingLiquidationA.setAdmin(await owner.getAddress());
        await BorrowingLiquidationB.setAdmin(await owner.getAddress());

        await CDSContractA.setTreasury(await treasuryA.getAddress());
        await CDSContractA.setBorrowingContract(await BorrowingContractA.getAddress());
        await CDSContractA.setBorrowLiquidation(await BorrowingLiquidationA.getAddress());
        await CDSContractA.setUSDaLimit(80);
        await CDSContractA.setUsdtLimit(20000000000);
        await CDSContractA.setGlobalVariables(await globalVariablesA.getAddress());

        await CDSContractB.setTreasury(await treasuryB.getAddress());
        await CDSContractB.setBorrowingContract(await BorrowingContractB.getAddress());
        await CDSContractB.setBorrowLiquidation(await BorrowingLiquidationB.getAddress());
        await CDSContractB.setUSDaLimit(80);
        await CDSContractB.setUsdtLimit(20000000000);
        await CDSContractB.setGlobalVariables(await globalVariablesB.getAddress());

        await BorrowingContractA.calculateCumulativeRate();
        await BorrowingContractB.calculateCumulativeRate();

        await treasuryA.setExternalProtocolAddresses(
            wethGatewayMainnet,
            cometMainnet,
            aavePoolAddressMainnet,
            aTokenAddressMainnet,
            wethAddressMainnet,
        )

        await treasuryB.setExternalProtocolAddresses(
            wethGatewayMainnet,
            cometMainnet,
            aavePoolAddressMainnet,
            aTokenAddressMainnet,
            wethAddressMainnet,
        )

        const provider = new ethers.JsonRpcProvider(INFURA_URL_MAINNET);
        const signer = new ethers.Wallet("ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",provider);

        const aToken = new ethers.Contract(aTokenAddressMainnet,aTokenABI,signer);
        const cETH = new ethers.Contract(cometMainnet,cETH_ABI,signer);

        return {
            TokenA,abondTokenA,usdtA,weETHA,rsETHA,
            CDSContractA,BorrowingContractA,
            treasuryA,optionsA,multiSignA,
            BorrowingLiquidationA,globalVariablesA,

            TokenB,abondTokenB,usdtB,weETHB,rsETHB,
            CDSContractB,BorrowingContractB,
            treasuryB,optionsB,multiSignB,
            BorrowingLiquidationB,globalVariablesB,

            owner,user1,user2,user3,
            provider,signer,TokenC
        }
    }

    describe("Minting tokens and transfering tokens", async function(){

        it("Should check Trinity Token contract & Owner of contracts",async () => {
            const{CDSContractA,TokenA} = await loadFixture(deployer);
            expect(await CDSContractA.usda()).to.be.equal(await TokenA.getAddress());
            expect(await CDSContractA.owner()).to.be.equal(await owner.getAddress());
            expect(await TokenA.owner()).to.be.equal(await owner.getAddress());
        })

        it("Should Mint token", async function() {
            const{TokenA} = await loadFixture(deployer);
            await TokenA.mint(owner.getAddress(),ethers.parseEther("1"));
            expect(await TokenA.balanceOf(owner.getAddress())).to.be.equal(ethers.parseEther("1"));
        })

        it("should deposit USDT into CDS",async function(){
            const {CDSContractA,CDSContractB,usdtA,usdtB,globalVariablesA} = await loadFixture(deployer);

            await usdtA.connect(user1).mint(user1.getAddress(),10000000000);
            await usdtA.connect(user1).approve(CDSContractA.getAddress(),10000000000);
            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()

            let nativeFee = 0
            ;[nativeFee] = await globalVariablesA.quote(1,0, options, false)
            await CDSContractA.connect(user1).deposit(10000000000,0,true,10000000000, { value: nativeFee.toString()});

            await usdtB.connect(user1).mint(user1.getAddress(),10000000000);
            await usdtB.connect(user1).approve(CDSContractB.getAddress(),10000000000);
            await CDSContractB.connect(user1).deposit(10000000000,0,false,10000000000, { value: nativeFee.toString()});
            
            expect(await CDSContractB.totalCdsDepositedAmount()).to.be.equal(10000000000);

            let tx = await CDSContractB.cdsDetails(user1.getAddress());
            expect(tx.hasDeposited).to.be.equal(true);
            expect(tx.index).to.be.equal(1);
        })

        it("should deposit USDT and USDa into CDS", async function(){
            const {CDSContractA,TokenA,usdtA,globalVariablesA} = await loadFixture(deployer);
            await usdtA.mint(owner.getAddress(),30000000000);
            await usdtA.connect(owner).approve(CDSContractA.getAddress(),30000000000);

            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()

            let nativeFee = 0
            ;[nativeFee] = await globalVariablesA.quote(1,0, options, false)

            await CDSContractA.deposit(20000000000,0,true,10000000000, { value: nativeFee.toString()});

            await TokenA.mint(owner.getAddress(),800000000)
            await TokenA.connect(owner).approve(CDSContractA.getAddress(),800000000);

            await CDSContractA.connect(owner).deposit(200000000,800000000,true,1000000000, { value: nativeFee.toString()});
            expect(await CDSContractA.totalCdsDepositedAmount()).to.be.equal(21000000000);

            let tx = await CDSContractA.cdsDetails(owner.getAddress());
            expect(tx.hasDeposited).to.be.equal(true);
            expect(tx.index).to.be.equal(2);
        })
    })

    describe("Checking revert conditions", function(){

        it("should revert if Liquidation amount can't greater than deposited amount", async function(){
            const {CDSContractA} = await loadFixture(deployer);
            await expect(CDSContractA.connect(owner).deposit(3000000000,700000000,true,ethers.parseEther("5000"))).to.be.revertedWith("Liquidation amount can't greater than deposited amount");
        })

        it("should revert if 0 USDT deposit into CDS", async function(){
            const {CDSContractA,TokenA,usdtA} = await loadFixture(deployer);
            await usdtA.mint(owner.getAddress(),10000000000);
            await usdtA.connect(owner).approve(CDSContractA.getAddress(),10000000000);

            expect(await usdtA.allowance(owner.getAddress(),CDSContractA.getAddress())).to.be.equal(10000000000);

            await expect(CDSContractA.deposit(0,ethers.parseEther("1"),true,ethers.parseEther("0.5"))).to.be.revertedWith("100% of amount must be USDT");
        })

        it("should revert if USDT deposit into CDS is greater than 20%", async function(){
            const {CDSContractA,TokenA,usdtA,globalVariablesA} = await loadFixture(deployer);
            await usdtA.mint(owner.getAddress(),30000000000);
            await usdtA.connect(owner).approve(CDSContractA.getAddress(),30000000000);

            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()
            let nativeFee = 0
            ;[nativeFee] = await globalVariablesA.quote(1,0, options, false)

            await CDSContractA.deposit(20000000000,0,true,10000000000,{ value: nativeFee.toString()});

            await TokenA.mint(owner.getAddress(),700000000)
            await TokenA.connect(owner).approve(CDSContractA.getAddress(),700000000);

            await expect(CDSContractA.connect(owner).deposit(3000000000,700000000,true,500000000,{ value: nativeFee.toString()})).to.be.revertedWith("Required USDa amount not met");
        })

        it("should revert if Insufficient USDa balance with msg.sender", async function(){
            const {CDSContractA,TokenA,usdtA,globalVariablesA} = await loadFixture(deployer);
            await usdtA.mint(owner.getAddress(),30000000000);
            await usdtA.connect(owner).approve(CDSContractA.getAddress(),30000000000);

            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()
            let nativeFee = 0
            ;[nativeFee] = await globalVariablesA.quote(1,0, options, false)

            await CDSContractA.deposit(20000000000,0,true,10000000000,{ value: nativeFee.toString()});

            await TokenA.mint(owner.getAddress(),70000000)
            await TokenA.connect(owner).approve(CDSContractA.getAddress(),70000000);

            await expect(CDSContractA.connect(owner).deposit(200000000,800000000,true,500000000,{ value: nativeFee.toString()})).to.be.revertedWith("Insufficient USDa balance with msg.sender");
        })

        it("should revert Insufficient USDT balance with msg.sender", async function(){
            const {CDSContractA,TokenA,usdtA,globalVariablesA} = await loadFixture(deployer);
            await usdtA.mint(owner.getAddress(),20100000000);
            await usdtA.connect(owner).approve(CDSContractA.getAddress(),20100000000);

            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()
            let nativeFee = 0
            ;[nativeFee] = await globalVariablesA.quote(1,0, options, false)

            await CDSContractA.deposit(20000000000,0,true,10000000000,{ value: nativeFee.toString()});

            await TokenA.mint(owner.getAddress(),800000000)
            await TokenA.connect(owner).approve(CDSContractA.getAddress(),800000000);


            await expect(CDSContractA.connect(owner).deposit(200000000,800000000,true,500000000,{ value: nativeFee.toString()})).to.be.revertedWith("Insufficient USDT balance with msg.sender");
        })

        it("should revert Insufficient USDT balance with msg.sender", async function(){
            const {CDSContractA,usdtA} = await loadFixture(deployer);
            await usdtA.mint(owner.getAddress(),10000000000);
            await usdtA.connect(owner).approve(CDSContractA.getAddress(),10000000000);

            expect(await usdtA.allowance(owner.getAddress(),CDSContractA.getAddress())).to.be.equal(10000000000);

            await expect(CDSContractA.deposit(20000000000,0,true,10000000000)).to.be.revertedWith("Insufficient USDT balance with msg.sender");
        })

        it("Should revert if zero balance is deposited in CDS",async () => {
            const {CDSContractA} = await loadFixture(deployer);
            await expect( CDSContractA.connect(user1).deposit(0,0,true,ethers.parseEther("1"))).to.be.revertedWith("Deposit amount should not be zero");
        })

        it("Should revert if Input address is invalid",async () => {
            const {CDSContractA} = await loadFixture(deployer);  
            await expect( CDSContractA.connect(owner).setBorrowingContract(ethers.ZeroAddress)).to.be.revertedWith("Input address is invalid");
            await expect( CDSContractA.connect(owner).setBorrowingContract(user1.getAddress())).to.be.revertedWith("Input address is invalid");
        })

        it("Should revert if the index is not valid",async function(){
            const {CDSContractA} = await loadFixture(deployer);
            await expect(CDSContractA.connect(user1).withdraw(1)).to.be.revertedWith("user doesn't have the specified index");
        })

        it("Should revert if the caller is not owner for setTreasury",async function(){
            const {CDSContractA,treasuryA} = await loadFixture(deployer);
            await expect(CDSContractA.connect(user1).setTreasury(treasuryA.getAddress())).to.be.revertedWith("Caller is not an admin");
        })

        it("Should revert if the caller is not owner for setWithdrawTimeLimit",async function(){
            const {CDSContractA} = await loadFixture(deployer);
            await expect(CDSContractA.connect(user1).setWithdrawTimeLimit(1000)).to.be.revertedWith("Caller is not an admin");
        })

        it("Should revert if the caller is not owner for setGlobalVariables",async function(){
            const {CDSContractA,globalVariablesA} = await loadFixture(deployer);
            await expect(CDSContractA.connect(user1).setGlobalVariables(await globalVariablesA.getAddress())).to.be.revertedWith("Caller is not an admin");
        })

        it("Should revert if the caller is not owner for setBorrowingContract",async function(){
            const {BorrowingContractA,CDSContractA} = await loadFixture(deployer);
            await expect(CDSContractA.connect(user1).setBorrowingContract(BorrowingContractA.getAddress())).to.be.revertedWith("Caller is not an admin");
        })

        it("Should revert if the Treasury address is zero",async function(){
            const {CDSContractA} = await loadFixture(deployer);
            await expect(CDSContractA.connect(owner).setTreasury(ZeroAddress)).to.be.revertedWith("Input address is invalid");
        })

        it("Should revert if the Global address is zero",async function(){
            const {CDSContractA} = await loadFixture(deployer);
            await expect(CDSContractA.connect(owner).setGlobalVariables(ZeroAddress)).to.be.revertedWith("Input address is invalid");
        })

        it("Should revert if the Treasury address is not contract address",async function(){
            const {CDSContractA} = await loadFixture(deployer);
            await expect(CDSContractA.connect(owner).setTreasury(user2.getAddress())).to.be.revertedWith("Input address is invalid");
        })

        it("Should revert if the zero sec is given in setWithdrawTimeLimit",async function(){
            const {CDSContractA} = await loadFixture(deployer);
            await expect(CDSContractA.connect(owner).setWithdrawTimeLimit(0)).to.be.revertedWith("Withdraw time limit can't be zero");
        })

        it("Should revert if USDa limit can't be zero",async () => {
            const {CDSContractA} = await loadFixture(deployer);  
            await expect( CDSContractA.connect(owner).setUSDaLimit(0)).to.be.revertedWith("USDa limit can't be zero");
        })

        it("Should revert if the caller is not owner for setUSDaLImit",async function(){
            const {CDSContractA} = await loadFixture(deployer);
            await expect(CDSContractA.connect(user1).setUSDaLimit(10)).to.be.revertedWith("Caller is not an admin");
        })

        it("Should revert if USDT limit can't be zero",async () => {
            const {CDSContractA} = await loadFixture(deployer);  
            await expect( CDSContractA.connect(owner).setUsdtLimit(0)).to.be.revertedWith("USDT limit can't be zero");
        })

        it("Should revert if the caller is not owner for setUsdtLImit",async function(){
            const {CDSContractA} = await loadFixture(deployer);
            await expect(CDSContractA.connect(user1).setUsdtLimit(1000)).to.be.revertedWith("Caller is not an admin");
        })

        
        it("Should revert This function can only called by Borrowing contract",async function(){
            const {CDSContractA} = await loadFixture(deployer);
            await expect(CDSContractA.connect(user1).calculateCumulativeRate(1000)).to.be.revertedWith("This function can only called by Borrowing contract");
        })
       
        it("Should revert This function can only called by Global variables or Liquidation contract",async function(){
            const {CDSContractA} = await loadFixture(deployer);
            await expect(CDSContractA.connect(user1).updateLiquidationInfo(1,[0,1,2,3,1,2])).to.be.revertedWith("This function can only called by Global variables or Liquidation contract");
        })        
        it("Should revert This function can only called by Global variables or Liquidation contract",async function(){
            const {CDSContractA} = await loadFixture(deployer);
            await expect(CDSContractA.connect(user1).updateTotalAvailableLiquidationAmount(1000)).to.be.revertedWith("This function can only called by Global variables or Liquidation contract");
        })        
        it("Should revert This function can only called by Global variables or Liquidation contract",async function(){
            const {CDSContractA} = await loadFixture(deployer);
            await expect(CDSContractA.connect(user1).updateTotalCdsDepositedAmount(1000)).to.be.revertedWith("This function can only called by Global variables or Liquidation contract");
        })        
        it("Should revert This function can only called by Global variables or Liquidation contract",async function(){
            const {CDSContractA} = await loadFixture(deployer);
            await expect(CDSContractA.connect(user1).updateTotalCdsDepositedAmountWithOptionFees(1000)).to.be.revertedWith("This function can only called by Global variables or Liquidation contract");
        })

        it("should revert Surplus USDT amount",async function(){
            const {CDSContractA,globalVariablesA,usdtA,usdtB} = await loadFixture(deployer);

            await usdtA.connect(user1).mint(user1.getAddress(),30000000000);
            await usdtA.connect(user1).approve(CDSContractA.getAddress(),30000000000);
            const options = "0x00030100110100000000000000000000000000030d40";

            let nativeFee = 0
            ;[nativeFee] = await globalVariablesA.quote(1,0, options, false)
            const tx = CDSContractA.connect(user1).deposit(30000000000,0,true,10000000000, { value: nativeFee.toString()});
            await expect(tx).to.be.revertedWith("Surplus USDT amount");

        })
        it("Should revert This function can only called by Global variables or Liquidation contract",async function(){
            const {CDSContractA} = await loadFixture(deployer);
            await expect(CDSContractA.connect(user1).updateTotalCdsDepositedAmountWithOptionFees(1000)).to.be.revertedWith("This function can only called by Global variables or Liquidation contract");
        })

        it("Should revert CDS: Not enough fund in CDS during withdraw from cds",async () => {
            const {BorrowingContractA,CDSContractA,usdtA,globalVariablesA} = await loadFixture(deployer);
            const timeStamp = await time.latest();

            await usdtA.mint(user2.getAddress(),20000000000)
            await usdtA.connect(user2).approve(CDSContractA.getAddress(),20000000000);

            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()

            let nativeFee = 0
            ;[nativeFee] = await globalVariablesA.quote(1,0, options, false)

            await CDSContractA.connect(user2).deposit(12000000000,0,true,12000000000, { value: nativeFee.toString()});

            const depositAmount = ethers.parseEther("1");
            
            await BorrowingContractA.connect(user2).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,1,
                depositAmount],
                {value: (depositAmount + BigInt(nativeFee))})
            
            const optionsA = Options.newOptions().addExecutorLzReceiveOption(1100000, 0).toHex().toString()
            let nativeFee1 = 0
            ;[nativeFee1] = await globalVariablesA.quote(3,0, optionsA, false);

            const tx = CDSContractA.connect(user2).withdraw(1, { value: nativeFee1});
            await expect(tx).to.be.revertedWith("CDS: Not enough fund in CDS");

        })
    })

    describe("Should update variables correctly",function(){
        it("Should update treasury correctly",async function(){
            const {treasuryA,CDSContractA,multiSignA} = await loadFixture(deployer);
            await multiSignA.connect(owner).approveSetterFunction([6]);
            await multiSignA.connect(owner1).approveSetterFunction([6]);
            await CDSContractA.connect(owner).setTreasury(treasuryA.getAddress());
            expect (await CDSContractA.treasuryAddress()).to.be.equal(await treasuryA.getAddress());     
        })
        it("Should update withdrawTime correctly",async function(){
            const {CDSContractA,multiSignA} = await loadFixture(deployer);
            await multiSignA.connect(owner).approveSetterFunction([2]);
            await multiSignA.connect(owner1).approveSetterFunction([2]);
            await CDSContractA.connect(owner).setWithdrawTimeLimit(1500);
            expect (await CDSContractA.withdrawTimeLimit()).to.be.equal(1500);     
        })
    })

    describe("To check CDS withdrawl function",function(){
        it("Should withdraw from cds,both chains have cds amount and eth deposit",async () => {
            const {BorrowingContractB,BorrowingContractA,CDSContractA,CDSContractB,usdtA,usdtB,globalVariablesA} = await loadFixture(deployer);
            const timeStamp = await time.latest();

            await usdtA.mint(user2.getAddress(),20000000000)
            await usdtA.mint(user1.getAddress(),50000000000)
            await usdtA.connect(user2).approve(CDSContractA.getAddress(),20000000000);
            await usdtA.connect(user1).approve(CDSContractA.getAddress(),50000000000);

            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()

            let nativeFee = 0
            ;[nativeFee] = await globalVariablesA.quote(1,0, options, false)

            await CDSContractA.connect(user2).deposit(12000000000,0,true,12000000000, { value: nativeFee.toString()});

            await usdtB.mint(user2.getAddress(),20000000000)
            await usdtB.mint(user1.getAddress(),50000000000)
            await usdtB.connect(user2).approve(CDSContractB.getAddress(),20000000000);
            await usdtB.connect(user1).approve(CDSContractB.getAddress(),50000000000);

            await CDSContractB.connect(user1).deposit(2000000000,0,true,1500000000, { value: nativeFee.toString()});

            const depositAmount = ethers.parseEther("1");
            
            await BorrowingContractB.connect(user1).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,
                1,
                depositAmount],
                {value: (depositAmount + BigInt(nativeFee))})
            await BorrowingContractA.connect(user2).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,1,
                depositAmount],
                {value: (depositAmount + BigInt(nativeFee))})
            
            const optionsA = Options.newOptions().addExecutorLzReceiveOption(1100000, 0).toHex().toString()
            let nativeFee1 = 0
            ;[nativeFee1] = await globalVariablesA.quote(3,0, optionsA, false);

            await CDSContractA.connect(user2).withdraw(1, { value: nativeFee1});
        })

        it("Should withdraw from cds,both chains have cds amount and eth deposit the cds user not opted for liq gains",async () => {
            const {BorrowingContractB,BorrowingContractA,CDSContractA,CDSContractB,usdtA,usdtB,globalVariablesA} = await loadFixture(deployer);
            const timeStamp = await time.latest();

            await usdtA.mint(user2.getAddress(),20000000000)
            await usdtA.mint(user1.getAddress(),50000000000)
            await usdtA.connect(user2).approve(CDSContractA.getAddress(),20000000000);
            await usdtA.connect(user1).approve(CDSContractA.getAddress(),50000000000);

            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()

            let nativeFee = 0
            ;[nativeFee] = await globalVariablesA.quote(1,0, options, false)

            await CDSContractA.connect(user2).deposit(12000000000,0,false,0, { value: nativeFee.toString()});

            await usdtB.mint(user2.getAddress(),20000000000)
            await usdtB.mint(user1.getAddress(),50000000000)
            await usdtB.connect(user2).approve(CDSContractB.getAddress(),20000000000);
            await usdtB.connect(user1).approve(CDSContractB.getAddress(),50000000000);

            await CDSContractB.connect(user1).deposit(2000000000,0,false,0, { value: nativeFee.toString()});

            const depositAmount = ethers.parseEther("1");
            
            await BorrowingContractB.connect(user1).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,
                1,
                depositAmount],
                {value: (depositAmount + BigInt(nativeFee))})
            await BorrowingContractA.connect(user2).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,1,
                depositAmount],
                {value: (depositAmount + BigInt(nativeFee))})
            
            const optionsA = Options.newOptions().addExecutorLzReceiveOption(1100000, 0).toHex().toString()
            let nativeFee1 = 0
            ;[nativeFee1] = await globalVariablesA.quote(3,0, optionsA, false);

            await CDSContractA.connect(user2).withdraw(1, { value: nativeFee1});
        })

        it("Should withdraw from cds,both chains have cds amount and one chain have eth deposit",async () => {
            const {BorrowingContractB,CDSContractA,CDSContractB,usdtA,usdtB,treasuryB,globalVariablesA} = await loadFixture(deployer);
            const timeStamp = await time.latest();

            await usdtA.mint(user2.getAddress(),20000000000)
            await usdtA.mint(user1.getAddress(),50000000000)
            await usdtA.connect(user2).approve(CDSContractA.getAddress(),20000000000);
            await usdtA.connect(user1).approve(CDSContractA.getAddress(),50000000000);

            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()

            let nativeFee = 0
            ;[nativeFee] = await globalVariablesA.quote(1,0, options, false)

            await CDSContractA.connect(user2).deposit(12000000000,0,true,12000000000, { value: nativeFee.toString()});

            await usdtB.mint(user2.getAddress(),20000000000)
            await usdtB.mint(user1.getAddress(),50000000000)
            await usdtB.connect(user2).approve(CDSContractB.getAddress(),20000000000);
            await usdtB.connect(user1).approve(CDSContractB.getAddress(),50000000000);

            await CDSContractB.connect(user1).deposit(2000000000,0,true,1500000000, { value: nativeFee.toString()});

            const depositAmount = ethers.parseEther("1");
            
            await BorrowingContractB.connect(user1).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,1,
                depositAmount],
                {value: (depositAmount + BigInt(nativeFee))})
            
            const optionsA = Options.newOptions().addExecutorLzReceiveOption(1100000, 0).toHex().toString()
            let nativeFee1 = 0
            ;[nativeFee1] = await globalVariablesA.quote(5,0, optionsA, false)

            await CDSContractA.connect(user2).withdraw(1, { value: nativeFee1});
        })

        it("Should withdraw from cds,one chain have cds amount and both chains have eth deposit",async () => {
            const {BorrowingContractB,BorrowingContractA,CDSContractA,usdtA,treasuryB,globalVariablesA} = await loadFixture(deployer);
            const timeStamp = await time.latest();

            await usdtA.mint(user2.getAddress(),20000000000)
            await usdtA.mint(user1.getAddress(),50000000000)
            await usdtA.connect(user2).approve(CDSContractA.getAddress(),20000000000);
            await usdtA.connect(user1).approve(CDSContractA.getAddress(),50000000000);

            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()

            let nativeFee = 0
            ;[nativeFee] = await globalVariablesA.quote(1,0, options, false)

            await CDSContractA.connect(user2).deposit(12000000000,0,true,12000000000, { value: nativeFee.toString()});
            await CDSContractA.connect(user1).deposit(5000000000,0,true,5000000000, { value: nativeFee.toString()});

            const depositAmount = ethers.parseEther("1");;
            
            await BorrowingContractB.connect(user1).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,1,
                depositAmount],
                {value: (depositAmount + BigInt(nativeFee))})
            await BorrowingContractB.connect(user2).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,1,
                depositAmount],
                {value: (depositAmount + BigInt(nativeFee))})
            await BorrowingContractA.connect(user2).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,1,
                depositAmount],
                {value: (depositAmount + BigInt(nativeFee))})
            
            const optionsA = Options.newOptions().addExecutorLzReceiveOption(1100000, 0).toHex().toString()
            let nativeFee1 = 0
            ;[nativeFee1] = await globalVariablesA.quote(3,0, optionsA, false)

            await CDSContractA.connect(user2).withdraw(1, { value: nativeFee1});

        })

        it("Should withdraw from cds,one chain have cds amount and one chain have eth deposit",async () => {
            const {BorrowingContractB,CDSContractA,usdtA,treasuryB,treasuryA,globalVariablesA,TokenB,provider} = await loadFixture(deployer);
            const timeStamp = await time.latest();

            await usdtA.mint(user2.getAddress(),20000000000)
            await usdtA.mint(user1.getAddress(),50000000000)
            await usdtA.connect(user2).approve(CDSContractA.getAddress(),20000000000);
            await usdtA.connect(user1).approve(CDSContractA.getAddress(),50000000000);

            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()

            let nativeFee = 0
            ;[nativeFee] = await globalVariablesA.quote(1,0, options, false)

            await CDSContractA.connect(user2).deposit(12000000000,0,true,12000000000, { value: nativeFee.toString()});
            await CDSContractA.connect(user1).deposit(5000000000,0,true,5000000000, { value: nativeFee.toString()});

            const depositAmount = ethers.parseEther("1");
            
            await BorrowingContractB.connect(user1).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,1,
                depositAmount],
                {value: (depositAmount + BigInt(nativeFee))})
            await BorrowingContractB.connect(user2).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,1,
                depositAmount],
                {value: (depositAmount + BigInt(nativeFee))})

            await BorrowingContractB.connect(user2).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,1,
                depositAmount],
                {value: (depositAmount + BigInt(nativeFee))})
            
            const optionsA = Options.newOptions().addExecutorLzReceiveOption(1100000, 0).toHex().toString()
            let nativeFee1 = 0
            ;[nativeFee1] = await globalVariablesA.quote(3,0, optionsA, false);

            const optionsB = Options.newOptions().addExecutorLzReceiveOption(12500000, 0).toHex().toString()
            let nativeFee2 = 0
            ;[nativeFee2] = await globalVariablesA.quote(5,0, optionsB, false)

            await BorrowingContractB.connect(owner).liquidate(
                await user2.getAddress(),
                1,
                80000,
                {value: (nativeFee1).toString()})

            await CDSContractA.connect(user2).withdraw(1, { value: nativeFee2});
        })

        it("Should withdraw from cds",async () => {
            const {CDSContractA,usdtA,globalVariablesA} = await loadFixture(deployer);

            await usdtA.connect(user1).mint(user1.getAddress(),10000000000);
            await usdtA.connect(user1).approve(CDSContractA.getAddress(),10000000000);
            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()

            let nativeFee = 0
            ;[nativeFee] = await globalVariablesA.quote(1,0, options, false)
            await CDSContractA.connect(user1).deposit(10000000000,0,true,10000000000, { value: nativeFee.toString()});

            await CDSContractA.connect(user1).withdraw(1, { value: nativeFee.toString()});
        })

        it("Should revert Already withdrawn",async () => {
            const {CDSContractA,usdtA,globalVariablesA} = await loadFixture(deployer);

            await usdtA.connect(user1).mint(user1.getAddress(),10000000000);
            await usdtA.connect(user1).approve(CDSContractA.getAddress(),10000000000);
            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()

            let nativeFee = 0
            ;[nativeFee] = await globalVariablesA.quote(1,0, options, false)
            await CDSContractA.connect(user1).deposit(10000000000,0,true,10000000000, { value: nativeFee.toString()});

            await CDSContractA.connect(user1).withdraw(1, { value: nativeFee.toString()});
            const tx =  CDSContractA.connect(user1).withdraw(1, { value: nativeFee.toString()});
            await expect(tx).to.be.revertedWith("Already withdrawn");
        })

        it("Should revert cannot withdraw before the withdraw time limit",async () => {
            const {CDSContractA,usdtA,multiSignA,globalVariablesA} = await loadFixture(deployer);

            await multiSignA.connect(owner).approveSetterFunction([2]);
            await multiSignA.connect(owner1).approveSetterFunction([2]);
            await CDSContractA.connect(owner).setWithdrawTimeLimit(1000);

            await usdtA.connect(user1).mint(user1.getAddress(),10000000000);
            await usdtA.connect(user1).approve(CDSContractA.getAddress(),10000000000);
            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()

            let nativeFee = 0
            ;[nativeFee] = await globalVariablesA.quote(1,0, options, false)
            await CDSContractA.connect(user1).deposit(10000000000,0,true,10000000000, { value: nativeFee.toString()});

            const tx =  CDSContractA.connect(user1).withdraw(1, { value: nativeFee.toString()});
            await expect(tx).to.be.revertedWith("cannot withdraw before the withdraw time limit");
        })
    })

    describe("Should redeem USDT correctly",function(){
        it("Should redeem USDT correctly",async function(){
            const {CDSContractA,TokenA,usdtA,globalVariablesA} = await loadFixture(deployer);
            await usdtA.mint(user1.getAddress(),20000000000);
            await usdtA.connect(user1).approve(CDSContractA.getAddress(),20000000000);

            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()
            let nativeFee = 0
            ;[nativeFee] = await globalVariablesA.quote(1,0, options, false)

            await CDSContractA.connect(user1).deposit(20000000000,0,true,10000000000,{ value: nativeFee.toString()});

            await TokenA.mint(owner.getAddress(),800000000);
            await TokenA.connect(owner).approve(CDSContractA.getAddress(),800000000);

            await CDSContractA.connect(owner).redeemUSDT(800000000,1500,1000,{ value: nativeFee.toString()});

            expect(await TokenA.totalSupply()).to.be.equal(20000000000);
            expect(await usdtA.balanceOf(owner.getAddress())).to.be.equal(1200000000);
        })

        it("Should revert Amount should not be zero",async function(){
            const {CDSContractA,globalVariablesA} = await loadFixture(deployer);

            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()
            let nativeFee = 0
            ;[nativeFee] = await globalVariablesA.quote(1,0, options, false)

            const tx = CDSContractA.connect(owner).redeemUSDT(0,1500,1000,{ value: nativeFee.toString()});
            await expect(tx).to.be.revertedWith("Amount should not be zero");
        })

        it("Should revert Insufficient USDa balance",async function(){
            const {CDSContractA,TokenA,globalVariablesA} = await loadFixture(deployer);
            await TokenA.mint(owner.getAddress(),80000000);

            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()
            let nativeFee = 0
            ;[nativeFee] = await globalVariablesA.quote(1,0, options, false)

            const tx = CDSContractA.connect(owner).redeemUSDT(800000000,1500,1000,{ value: nativeFee.toString()});
            await expect(tx).to.be.revertedWith("Insufficient balance");
        })
    })

    describe("Should calculate value correctly",function(){
        it("Should calculate value for no deposit in borrowing",async function(){
            const {CDSContractA,usdtA,globalVariablesA} = await loadFixture(deployer);
            await usdtA.mint(user1.getAddress(),20000000000);
            await usdtA.connect(user1).approve(CDSContractA.getAddress(),20000000000);

            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()
            let nativeFee = 0
            ;[nativeFee] = await globalVariablesA.quote(1,0, options, false)
            await CDSContractA.connect(user1).deposit(20000000000,0,true,10000000000,{ value: nativeFee.toString()});
        })

        it("Should calculate value for no deposit in borrowing and 2 deposit in cds",async function(){
            const {CDSContractA,TokenA,usdtA,globalVariablesA} = await loadFixture(deployer);
            await usdtA.mint(user1.getAddress(),20000000000);
            await usdtA.connect(user1).approve(CDSContractA.getAddress(),20000000000);

            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()
            let nativeFee = 0
            ;[nativeFee] = await globalVariablesA.quote(1,0, options, false)
            await CDSContractA.connect(user1).deposit(20000000000,0,true,10000000000,{ value: nativeFee.toString()});

            await TokenA.mint(user2.getAddress(),4000000000);
            await TokenA.connect(user2).approve(CDSContractA.getAddress(),4000000000);
            await CDSContractA.connect(user2).deposit(0,4000000000,true,4000000000,{ value: nativeFee.toString()});

            await CDSContractA.connect(user1).withdraw(1,{ value: nativeFee.toString()});
        })
        
    })

    describe("CDS users should able to deposit and withdraw, if different collaterals deposited in Borrow", function(){
        it("Should able to deposit, if WeETH deposited in this chain borrow after initial deposit",async function(){
            const {
                BorrowingContractA,weETHA,
                CDSContractA,
                usdtA,treasuryA
                ,globalVariablesA
            } = await loadFixture(deployer);
            const timeStamp = await time.latest();

            await usdtA.connect(user1).mint(user1.getAddress(),20000000000);
            await usdtA.connect(user1).approve(CDSContractA.getAddress(),20000000000);
            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()

            let nativeFee = 0
            ;[nativeFee] = await globalVariablesA.quote(1,1,options, false)
            await CDSContractA.connect(user1).deposit(10000000000,0,true,10000000000, { value: nativeFee.toString()});
            
            await weETHA.connect(user2).mint(user2.getAddress(),ethers.parseEther('10'));
            await weETHA.connect(user2).approve(await BorrowingContractA.getAddress(), ethers.parseEther("0.5"));

            await BorrowingContractA.connect(user2).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,
                2,
                ethers.parseEther("0.5")],
                {value: BigInt(nativeFee)}
            )
            
            await CDSContractA.connect(user1).deposit(10000000000,0,true,10000000000, { value: nativeFee.toString()});
        })

        it("Should able to deposit, if WeETH is deposited in other chain borrow after initial deposit",async function(){
            const {
                BorrowingContractB,weETHB,
                CDSContractA,
                usdtA,treasuryA
                ,globalVariablesA,
            } = await loadFixture(deployer);
            const timeStamp = await time.latest();

            await usdtA.connect(user1).mint(user1.getAddress(),20000000000);
            await usdtA.connect(user1).approve(CDSContractA.getAddress(),20000000000);
            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()

            let nativeFee = 0
            ;[nativeFee] = await globalVariablesA.quote(1,1,options, false)
            await CDSContractA.connect(user1).deposit(10000000000,0,true,10000000000, { value: nativeFee.toString()});
            
            await weETHB.connect(user2).mint(user2.getAddress(),ethers.parseEther('10'));
            await weETHB.connect(user2).approve(await BorrowingContractB.getAddress(), ethers.parseEther("0.5"));

            await BorrowingContractB.connect(user2).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,
                2,
                ethers.parseEther("0.5")],
                {value: BigInt(nativeFee)}
            )
            
            await CDSContractA.connect(user1).deposit(10000000000,0,true,10000000000, { value: nativeFee.toString()});
        })

        it("Should able to withdraw, if WeETH is deposited in this chain borrow after initial deposit",async function(){
            const {
                BorrowingContractA,weETHA,
                CDSContractA,
                usdtA,treasuryA
                ,globalVariablesA
            } = await loadFixture(deployer);
            const timeStamp = await time.latest();

            await usdtA.connect(user1).mint(user1.getAddress(),20000000000);
            await usdtA.connect(user1).approve(CDSContractA.getAddress(),20000000000);
            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()

            let nativeFee = 0
            ;[nativeFee] = await globalVariablesA.quote(1,1,options, false)
            await CDSContractA.connect(user1).deposit(10000000000,0,true,10000000000, { value: nativeFee.toString()});
            await CDSContractA.connect(user1).deposit(10000000000,0,true,10000000000, { value: nativeFee.toString()});
            await CDSContractA.connect(user1).deposit(10000000000,0,true,10000000000, { value: nativeFee.toString()});

            await weETHA.connect(user2).mint(user2.getAddress(),ethers.parseEther('10'));
            await weETHA.connect(user2).approve(await BorrowingContractA.getAddress(), ethers.parseEther("0.5"));

            await BorrowingContractA.connect(user2).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,
                2,
                ethers.parseEther("0.5")],
                {value: BigInt(nativeFee)}
            )
            const optionsA = Options.newOptions().addExecutorLzReceiveOption(1100000, 0).toHex().toString()
            let nativeFee1 = 0
            ;[nativeFee1] = await globalVariablesA.quote(3,0, optionsA, false);
            await CDSContractA.connect(user1).withdraw(1, { value: nativeFee1.toString()});
        })

        it("Should able to withdraw, if WeETH id deposited in other chain borrow after initial deposit",async function(){
            const {
                BorrowingContractB,weETHB,
                CDSContractA,
                usdtA,treasuryA
                ,globalVariablesA,
            } = await loadFixture(deployer);
            const timeStamp = await time.latest();

            await usdtA.connect(user1).mint(user1.getAddress(),20000000000);
            await usdtA.connect(user1).approve(CDSContractA.getAddress(),20000000000);
            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()

            let nativeFee = 0
            ;[nativeFee] = await globalVariablesA.quote(1,1,options, false)
            await CDSContractA.connect(user1).deposit(10000000000,0,true,10000000000, { value: nativeFee.toString()});
            
            await weETHB.connect(user2).mint(user2.getAddress(),ethers.parseEther('10'));
            await weETHB.connect(user2).approve(await BorrowingContractB.getAddress(), ethers.parseEther("0.5"));

            await BorrowingContractB.connect(user2).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,
                2,
                ethers.parseEther("0.5")],
                {value: BigInt(nativeFee)}
            )
            
            await CDSContractA.connect(user1).deposit(10000000000,0,true,10000000000, { value: nativeFee.toString()});
            const optionsA = Options.newOptions().addExecutorLzReceiveOption(1100000, 0).toHex().toString()
            let nativeFee1 = 0
            ;[nativeFee1] = await globalVariablesA.quote(3,0, optionsA, false);
            await CDSContractA.connect(user1).withdraw(1, { value: nativeFee1.toString()});
        })

        it("Should able to withdraw, if WeETH is liquidated in this chain borrow after initial deposit",async function(){
            const {
                BorrowingContractA,weETHA,
                CDSContractA,
                usdtA,
                globalVariablesA
            } = await loadFixture(deployer);
            const timeStamp = await time.latest();

            await usdtA.connect(user1).mint(user1.getAddress(),20000000000);
            await usdtA.connect(user1).approve(CDSContractA.getAddress(),20000000000);
            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()

            let nativeFee = 0
            ;[nativeFee] = await globalVariablesA.quote(1,1,options, false)
            await CDSContractA.connect(user1).deposit(10000000000,0,true,10000000000, { value: nativeFee.toString()});
            
            await weETHA.connect(user2).mint(user2.getAddress(),ethers.parseEther('10'));
            await weETHA.connect(user2).approve(await BorrowingContractA.getAddress(), ethers.parseEther("0.5"));

            await BorrowingContractA.connect(user2).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,
                2,
                ethers.parseEther("0.5")],
                {value: BigInt(nativeFee)}
            )

            const optionsA = Options.newOptions().addExecutorLzReceiveOption(1100000, 0).toHex().toString()
            let nativeFee1 = 0
            ;[nativeFee1] = await globalVariablesA.quote(3,0, optionsA, false);

            const optionsB = Options.newOptions().addExecutorLzReceiveOption(12500000, 0).toHex().toString()
            let nativeFee2 = 0
            ;[nativeFee2] = await globalVariablesA.quote(5,0, optionsB, false)

            await BorrowingContractA.connect(owner).liquidate(
                await user2.getAddress(),
                1,
                80000,
                {value: (nativeFee1).toString()})
            await CDSContractA.connect(user1).withdraw(1, { value: nativeFee2.toString()});
        })

        it("Should able to withdraw, if WeETH is liquidated in other chain borrow after initial deposit",async function(){
            const {
                BorrowingContractA,weETHA,weETHB,
                CDSContractB,usdtB,globalVariablesA
            } = await loadFixture(deployer);
            const timeStamp = await time.latest();

            await usdtB.connect(user1).mint(user1.getAddress(),20000000000);
            await usdtB.connect(user1).approve(CDSContractB.getAddress(),20000000000);
            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()

            let nativeFee = 0
            ;[nativeFee] = await globalVariablesA.quote(1,1,options, false)
            await CDSContractB.connect(user1).deposit(10000000000,0,true,10000000000, { value: nativeFee.toString()});
            
            await weETHA.connect(user2).mint(user2.getAddress(),ethers.parseEther('10'));
            await weETHA.connect(user2).approve(await BorrowingContractA.getAddress(), ethers.parseEther("0.5"));

            await BorrowingContractA.connect(user2).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,
                2,
                ethers.parseEther("0.5")],
                {value: BigInt(nativeFee)}
            )

            const optionsA = Options.newOptions().addExecutorLzReceiveOption(1100000, 0).toHex().toString()
            let nativeFee1 = 0
            ;[nativeFee1] = await globalVariablesA.quote(3,0, optionsA, false);

            const optionsB = Options.newOptions().addExecutorLzReceiveOption(16000000, 0).toHex().toString()
            let nativeFee2 = 0
            ;[nativeFee2] = await globalVariablesA.quote(5,0, optionsB, false)

            await BorrowingContractA.connect(owner).liquidate(
                await user2.getAddress(),
                1,
                80000,
                {value: (nativeFee1).toString()})
            await CDSContractB.connect(user1).withdraw(1, { value: nativeFee2.toString()});
        })

        it("Should able to withdraw, if more than one type of collateral is liquidated in this chain borrow after initial deposit",async function(){
            const {
                BorrowingContractA,weETHA,
                CDSContractA,
                usdtA,
                globalVariablesA
            } = await loadFixture(deployer);
            const timeStamp = await time.latest();

            await usdtA.connect(user1).mint(user1.getAddress(),20000000000);
            await usdtA.connect(user1).approve(CDSContractA.getAddress(),20000000000);
            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()

            let nativeFee = 0
            ;[nativeFee] = await globalVariablesA.quote(1,1,options, false)
            await CDSContractA.connect(user1).deposit(10000000000,0,true,10000000000, { value: nativeFee.toString()});

            await BorrowingContractA.connect(user3).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,
                1,
                ethers.parseEther("1")],
                {value: ethers.parseEther("1") + BigInt(nativeFee)}
            )
            
            await weETHA.connect(user2).mint(user2.getAddress(),ethers.parseEther('10'));
            await weETHA.connect(user2).approve(await BorrowingContractA.getAddress(), ethers.parseEther("0.5"));

            await BorrowingContractA.connect(user2).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,
                2,
                ethers.parseEther("0.5")],
                {value: BigInt(nativeFee)}
            )

            const optionsA = Options.newOptions().addExecutorLzReceiveOption(1100000, 0).toHex().toString()
            let nativeFee1 = 0
            ;[nativeFee1] = await globalVariablesA.quote(3,0, optionsA, false);

            const optionsB = Options.newOptions().addExecutorLzReceiveOption(12500000, 0).toHex().toString()
            let nativeFee2 = 0
            ;[nativeFee2] = await globalVariablesA.quote(5,0, optionsB, false)

            await BorrowingContractA.connect(owner).liquidate(
                await user2.getAddress(),
                1,
                80000,
                {value: (nativeFee1).toString()})

            await BorrowingContractA.connect(owner).liquidate(
                await user3.getAddress(),
                1,
                80000,
                {value: (nativeFee1).toString()})
            await CDSContractA.connect(user1).withdraw(1, { value: nativeFee2.toString()});
        })

        // it.only("Should able to withdraw, if more than one type of collateral is liquidated in other chain borrow after initial deposit",async function(){
        //     const {
        //         BorrowingContractA,weETHA,weETHB,rsETHA,
        //         CDSContractB,usdtB,globalVariablesA
        //     } = await loadFixture(deployer);
        //     const timeStamp = await time.latest();

        //     await usdtB.connect(user1).mint(user1.getAddress(),20000000000);
        //     await usdtB.connect(user1).approve(CDSContractB.getAddress(),20000000000);
        //     const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()

        //     let nativeFee = 0
        //     ;[nativeFee] = await globalVariablesA.quote(1,1,options, false)
        //     await CDSContractB.connect(user1).deposit(10000000000,0,true,10000000000, { value: nativeFee.toString()});

        //     await rsETHA.connect(user3).mint(user3.getAddress(),ethers.parseEther('10'));
        //     await rsETHA.connect(user3).approve(await BorrowingContractA.getAddress(), ethers.parseEther("1"));
            
        //     await weETHA.connect(user2).mint(user2.getAddress(),ethers.parseEther('10'));
        //     await weETHA.connect(user2).approve(await BorrowingContractA.getAddress(), ethers.parseEther("1"));

        //     await BorrowingContractA.connect(user3).depositTokens(
        //         100000,
        //         timeStamp,
        //         [1,
        //         110000,
        //         ethVolatility,
        //         3,
        //         ethers.parseEther("1")],
        //         {value: BigInt(nativeFee)}
        //     )

        //     await BorrowingContractA.connect(user2).depositTokens(
        //         100000,
        //         timeStamp,
        //         [1,
        //         110000,
        //         ethVolatility,
        //         2,
        //         ethers.parseEther("1")],
        //         {value: BigInt(nativeFee)}
        //     )

        //     const optionsA = Options.newOptions().addExecutorLzReceiveOption(1100000, 0).toHex().toString()
        //     let nativeFee1 = 0
        //     ;[nativeFee1] = await globalVariablesA.quote(3,0, optionsA, false);

        //     const optionsB = Options.newOptions().addExecutorLzReceiveOption(17000000, 0).toHex().toString()
        //     let nativeFee2 = 0
        //     ;[nativeFee2] = await globalVariablesA.quote(5,0, optionsB, false)

        //     await BorrowingContractA.connect(owner).liquidate(
        //         await user2.getAddress(),
        //         1,
        //         80000,
        //         {value: (nativeFee1).toString()})

        //     await BorrowingContractA.connect(owner).liquidate(
        //         await user3.getAddress(),
        //         1,
        //         80000,
        //         {value: (nativeFee1).toString()})
        //     await CDSContractB.connect(user1).withdraw(1, { value: nativeFee2.toString()});
        // })
    })

})
