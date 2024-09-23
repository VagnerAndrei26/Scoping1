const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { it } = require("mocha")
import { ethers,upgrades } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { describe } from "node:test";
import { BorrowLib } from "../typechain-types";
import { Contract, ContractFactory,ZeroAddress } from 'ethers'
import { Options } from '@layerzerolabs/lz-v2-utilities'
import { EvmPriceServiceConnection } from "@pythnetwork/pyth-evm-js";
import { PriceServiceConnection } from "@pythnetwork/price-service-client";

import {
    wethGatewayMainnet,wethGatewaySepolia,
    priceFeedAddressEthToUsdMainnet,priceFeedAddressWeEthToEthMainnet,
    priceFeedAddressRsEthToEthMainnet,priceFeedAddressSepolia,
    aTokenAddressMainnet,aTokenAddressSepolia,
    aavePoolAddressMainnet,aavePoolAddressSepolia,
    cometMainnet,cometSepolia,
    INFURA_URL_MAINNET,INFURA_URL_SEPOLIA,
    aTokenABI,
    cETH_ABI,
    wethAddressMainnet,wethAddressSepolia,
    endPointAddressMainnet,endPointAddressBase,
    weETHAddressMainnet,
    rsETHAddressMainnet,
    ethAddressMainnet,
    etherFiDepositAddressMainnet,
    etherFiDepositABI,
    kelpDaoDepositAddressMainnet,
    kelpDaoDepositABI,
    eETHTokenAddress,
    erc20ABI,
    WeETHABI
    } from "./utils/index"

describe("Borrowing Contract",function(){

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

        const priceFeedAddressMainnetA = await mockPriceFeedA.getAddress();
        const priceFeedAddressMainnetB = await mockPriceFeedB.getAddress();

        const cdsLibFactory = await ethers.getContractFactory("CDSLib");
        const cdsLib = await cdsLibFactory.deploy();

        const CDS = await ethers.getContractFactory("CDSTest",{
            libraries: {
                CDSLib:await cdsLib.getAddress()
            }
        });
        const CDSContractA = await upgrades.deployProxy(CDS,[
            await TokenA.getAddress(),
            priceFeedAddressMainnetA,
            await usdtA.getAddress(),
            await multiSignA.getAddress()
        ],{initializer:'initialize',
            unsafeAllowLinkedLibraries:true
        ,kind:'uups'})

        const CDSContractB = await upgrades.deployProxy(CDS,[
            await TokenB.getAddress(),
            priceFeedAddressMainnetB,
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
            [priceFeedAddressMainnetA,
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
            [priceFeedAddressMainnetB,
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

    async function deployerTest(){
        [owner,owner1,owner2,user1,user2,user3] = await ethers.getSigners();

        const test = await ethers.getContractFactory("TestContract");
        const Test = await test.deploy();

        return { Test }
    }

    describe("Should deposit ETH and mint Trinity",function(){

        it("Should deposit ETH with two cds deposits",async function(){
            const {
                BorrowingContractA,BorrowingContractB,
                CDSContractA,CDSContractB,
                usdtA,usdtB,
                treasuryA,globalVariablesA
            } = await loadFixture(deployer);
            const timeStamp = await time.latest();

            await usdtA.connect(user1).mint(user1.getAddress(),10000000000);
            await usdtA.connect(user1).approve(CDSContractA.getAddress(),10000000000);
            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()

            let nativeFee = 0
            ;[nativeFee] = await globalVariablesA.quote(1,0,options, false)
            await CDSContractA.connect(user1).deposit(10000000000,0,true,10000000000, { value: nativeFee.toString()});

            await usdtB.connect(user1).mint(user1.getAddress(),10000000000);
            await usdtB.connect(user1).approve(CDSContractB.getAddress(),10000000000);
            await CDSContractB.connect(user1).deposit(10000000000,0,true,10000000000, { value: nativeFee.toString()});
            
            const depositAmount = ethers.parseEther("50");

            await BorrowingContractB.connect(user2).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,
                1,
                depositAmount],
                {value: (depositAmount + BigInt(nativeFee))})
        })

        it("Should deposit ETH in different chain with cds deposits",async function(){
            const {BorrowingContractB,CDSContractA,usdtA,globalVariablesA} = await loadFixture(deployer);
            const timeStamp = await time.latest();

            await usdtA.connect(user1).mint(user1.getAddress(),10000000000);
            await usdtA.connect(user1).approve(CDSContractA.getAddress(),10000000000);
            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()

            let nativeFee = 0
            ;[nativeFee] = await globalVariablesA.quote(1,0,options, false);
            await CDSContractA.connect(user1).deposit(10000000000,0,true,10000000000, { value: nativeFee.toString()});
            
            const depositAmount = ethers.parseEther("50");

            await BorrowingContractB.connect(user2).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,1,
                depositAmount],
                {value: (depositAmount + BigInt(nativeFee))})
        })

        it("Should transfer USDa from A to B",async function(){
            const {TokenA} = await loadFixture(deployer);
            const initialAmount = ethers.parseEther('100')
            await TokenA.mint(await user1.getAddress(), initialAmount)
    
            const tokensToSend = ethers.parseEther('1')
    
            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()
    
            const sendParam = [
                eidB,
                ethers.zeroPadValue(await user2.getAddress(), 32),
                tokensToSend,
                tokensToSend,
                options,
                '0x',
                '0x',
            ]
    
            const [nativeFee] = await TokenA.quoteSend(sendParam, false)
    
            await TokenA.connect(user1).send(sendParam, [nativeFee, 0], await user1.getAddress(), { value: nativeFee })
        })

        it("Should transfer USDa from A to C",async function(){
            const {TokenA} = await loadFixture(deployer);
            const initialAmount = ethers.parseEther('100')
            await TokenA.mint(await user1.getAddress(), initialAmount)
    
            const tokensToSend = ethers.parseEther('1')
    
            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()
    
            const sendParam = [
                eidC,
                ethers.zeroPadValue(await user2.getAddress(), 32),
                tokensToSend,
                tokensToSend,
                options,
                '0x',
                '0x',
            ]
    
            const [nativeFee] = await TokenA.quoteSend(sendParam, false)
    
            await TokenA.connect(user1).send(sendParam, [nativeFee, 0], await user1.getAddress(), { value: nativeFee })
        })

        it("Should transfer USDa from B to C",async function(){
            const {TokenB} = await loadFixture(deployer);
            const initialAmount = ethers.parseEther('100')
            await TokenB.mint(await user1.getAddress(), initialAmount)
    
            const tokensToSend = ethers.parseEther('1')
    
            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()
    
            const sendParam = [
                eidC,
                ethers.zeroPadValue(await user2.getAddress(), 32),
                tokensToSend,
                tokensToSend,
                options,
                '0x',
                '0x',
            ]
    
            const [nativeFee] = await TokenB.quoteSend(sendParam, false)
    
            await TokenB.connect(user1).send(sendParam, [nativeFee, 0], await user1.getAddress(), { value: nativeFee })
        })
    
        it("Should set APY",async function(){
            const {BorrowingContractA,multiSignA} = await loadFixture(deployer);
            await multiSignA.connect(owner).approveSetterFunction([1]);
            await multiSignA.connect(owner1).approveSetterFunction([1]);
            await BorrowingContractA.setAPR(50,BigInt("1000000001547125957863212448"));
            await expect(await BorrowingContractA.ratePerSec()).to.be.equal(BigInt("1000000001547125957863212448"));
        })

        it("Should called by only owner(setAPR)",async function(){
            const {BorrowingContractA,multiSignA} = await loadFixture(deployer);
            await multiSignA.connect(owner).approveSetterFunction([1]);
            await multiSignA.connect(owner1).approveSetterFunction([1]);
            const tx = BorrowingContractA.connect(user1).setAPR(50,BigInt("1000000001547125957863212448"));
            await expect(tx).to.be.revertedWith("Caller is not an admin");
        })
    
        it("Should revert if rate is zero",async function(){
            const {BorrowingContractA,multiSignA} = await loadFixture(deployer);
            await multiSignA.connect(owner).approveSetterFunction([1]);
            await multiSignA.connect(owner1).approveSetterFunction([1]);
            const tx = BorrowingContractA.connect(owner).setAPR(0,0);
    
            await expect(tx).to.be.revertedWith("Rate should not be zero");
        })
    
        it("Should revert if set APY without approval",async function(){
            const {BorrowingContractA} = await loadFixture(deployer);
            const tx = BorrowingContractA.connect(owner).setAPR(50,BigInt("1000000001547125957863212448"));    
            await expect(tx).to.be.revertedWith("Required approvals not met");
        })
    
        it("Should get LTV",async function(){
            const {BorrowingContractA} = await loadFixture(deployer);
            await expect(await BorrowingContractA.getLTV()).to.be.equal(80);
        })
    })

    describe("Should get the chainlink prices",function(){
        // it("Should get ETH/USD price",async function(){
        //     const {BorrowingContractA} = await loadFixture(deployer);
        //     const tx = await BorrowingContractA.getUSDValue();
        //     expect(tx).to.be.equal(100000);
        // })

        it("Should get ETH/USD price",async function(){
            const {BorrowingContractA} = await loadFixture(deployer);
            await BorrowingContractA.getUSDValue(ethAddressMainnet);
        })

        it("Should get WeETH/ETH exchangeRate",async function(){
            const {BorrowingContractA,weETHA} = await loadFixture(deployer);
            await BorrowingContractA.getUSDValue(await weETHA.getAddress());
        })

        it("Should get rsETH/ETH exchangeRate",async function(){
            const {BorrowingContractA,rsETHA} = await loadFixture(deployer);
            await BorrowingContractA.getUSDValue(await rsETHA.getAddress());
        })
    })

    describe("Should revert errors",function(){
        it("Should revert if zero eth is deposited",async function(){
            const {CDSContractA,BorrowingContractA,globalVariablesA,usdtA} = await loadFixture(deployer);
            const timeStamp = await time.latest();
            await usdtA.connect(user1).mint(user1.getAddress(),10000000000);
            await usdtA.connect(user1).approve(CDSContractA.getAddress(),10000000000);
            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()

            let nativeFee = 0
            ;[nativeFee] = await globalVariablesA.quote(1,0, options, false)
            await CDSContractA.connect(user1).deposit(10000000000,0,true,10000000000, { value: nativeFee.toString()});
 

            const tx = BorrowingContractA.connect(user1).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,1,
                0],      
                {value: (BigInt(0) +  BigInt(nativeFee))})
            await expect(tx).to.be.revertedWith("Cannot deposit zero tokens");
        })

        // it("Should revert if LTV set to zero value before providing loans",async function(){
        //     const {BorrowingContractA,CDSContractA,treasuryA,usdtA} = await loadFixture(deployer);
        //     await BorrowingContractA.setLTV(0);          
        //     const timeStamp = await time.latest();
        //     const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()

        //     let nativeFee = 0
        //     ;[nativeFee] = await globalVariablesA.quote(1,0, options, false)
        //     let nativeFee1 = 0
        //     ;[nativeFee1] = await BorrowingContractA.quote(ei0,dB, [5,10,15,20,25,30,35,40],options, false)
        //     let nativeFee2 = 0
        //     ;[nativeFee2] = await treasuryA.quote(ei0,dB,1, [ZeroAddress,0],[ZeroAddress,0],options, false)

        //     await usdtA.connect(user1).mint(user1.getAddress(),10000000000)
        //     await usdtA.connect(user1).approve(CDSContractA.getAddress(),10000000000);
        //     await CDSContractA.connect(user1).deposit(10000000000,0,false,0, { value: nativeFee.toString()});

        //     const tx =  BorrowingContractA.connect(user1).depositTokens(
        //         100000,
        //         timeStamp,
    //         1,
        //         110000,
        //         ethVolatility,0,
        //      ]   ethers.parseEther("1"),
        //         {value: (ethers.parseEther("1") +  BigInt(nativeFee))})

        //     await expect(tx).to.be.revertedWith("LTV must be set to non-zero value before providing loans");
        // })

        it("Should revert if LTV set to zero",async function(){
            const {BorrowingContractA,multiSignA} = await loadFixture(deployer);
            await multiSignA.connect(owner).approveSetterFunction([0]);
            await multiSignA.connect(owner1).approveSetterFunction([0]);
            const tx = BorrowingContractA.connect(owner).setLTV(0);          
            await expect(tx).to.be.revertedWith("LTV can't be zero");
        })

        it("Should revert Function should only be called by treasury",async function(){
            const {BorrowingContractA} = await loadFixture(deployer);

            const tx = BorrowingContractA.connect(owner).updateLastEthVaultValue(1);          
            await expect(tx).to.be.revertedWith("Function should only be called by treasury");
        })

        it("Should revert if the caller is not owner for setTreasury",async function(){
            const {BorrowingContractA,treasuryA} = await loadFixture(deployer);
            await expect(BorrowingContractA.connect(user1).setTreasury(await treasuryA.getAddress())).to.be.revertedWith("Caller is not an admin");
        })

        it("Should revert if the Treasury address is zero",async function(){
            const {BorrowingContractA} = await loadFixture(deployer);
            await expect(BorrowingContractA.connect(owner).setTreasury(ZeroAddress)).to.be.revertedWith("Treasury must be contract address & can't be zero address");
        })

        it("Should revert if the caller is not owner for setBorrowLiquidation",async function(){
            const {BorrowingContractA,BorrowingLiquidationA} = await loadFixture(deployer);
            await expect(BorrowingContractA.connect(user1).setBorrowLiquidation(await BorrowingLiquidationA.getAddress())).to.be.revertedWith("Caller is not an admin");
        })

        it("Should revert if the BorrowLiquidation address is zero",async function(){
            const {BorrowingContractA} = await loadFixture(deployer);
            await expect(BorrowingContractA.connect(owner).setBorrowLiquidation(ZeroAddress)).to.be.revertedWith("Borrow Liquidation must be contract address & can't be zero address");
        })

        it("Should revert if the caller is not owner for setBorrowLiquidation",async function(){
            const {CDSContractA,BorrowingLiquidationA} = await loadFixture(deployer);
            await expect(CDSContractA.connect(user1).setBorrowLiquidation(await BorrowingLiquidationA.getAddress())).to.be.revertedWith("Caller is not an admin");
        })

        it("Should revert if the BorrowLiquidation address is zero",async function(){
            const {CDSContractA} = await loadFixture(deployer);
            await expect(CDSContractA.connect(owner).setBorrowLiquidation(ZeroAddress)).to.be.revertedWith("Input address is invalid");
        })

        it("Should revert if the caller is not owner for setBondRatio",async function(){
            const {BorrowingContractA} = await loadFixture(deployer);
            await expect(BorrowingContractA.connect(user1).setBondRatio(4)).to.be.revertedWith("Caller is not an admin");
        })

        it("Should revert if the caller is not owner for updateRatePerSecByUSDaPrice",async function(){
            const {BorrowingContractA} = await loadFixture(deployer);
            await expect(BorrowingContractA.connect(user1).updateRatePerSecByUSDaPrice(4)).to.be.revertedWith("Caller is not an admin");
        })

        it("Should revert if the BOND RATIO is zero",async function(){
            const {BorrowingContractA} = await loadFixture(deployer);
            await expect(BorrowingContractA.connect(owner).setBondRatio(0)).to.be.revertedWith("Bond Ratio can't be zero");
        })

        it("Should revert if the USDa price is zero",async function(){
            const {BorrowingContractA} = await loadFixture(deployer);
            await expect(BorrowingContractA.connect(owner).updateRatePerSecByUSDaPrice(0)).to.be.revertedWith("Invalid USDa price");
        })

        it("Should revert if the caller is not owner for setOptions",async function(){
            const {BorrowingContractA,optionsA} = await loadFixture(deployer);
            await expect(BorrowingContractA.connect(user1).setOptions(await optionsA.getAddress())).to.be.revertedWith("Caller is not an admin");
        })

        it("Should revert if the Options address is zero",async function(){
            const {BorrowingContractA} = await loadFixture(deployer);
            await expect(BorrowingContractA.connect(owner).setOptions(ZeroAddress)).to.be.revertedWith("Options must be contract address & can't be zero address");
        })

        it("Should revert if the caller is not owner for setAdmin",async function(){
            const {BorrowingContractA} = await loadFixture(deployer);
            await expect(BorrowingContractA.connect(user1).setAdmin(owner.getAddress())).to.be.revertedWith("Ownable: caller is not the owner");
        })

        it("Should revert if the Admin address is zero",async function(){
            const {BorrowingContractA} = await loadFixture(deployer);
            await expect(BorrowingContractA.connect(owner).setAdmin(ZeroAddress)).to.be.revertedWith("Admin can't be contract address & zero address");
        })

        it("Should revert if the Treasury address is zero",async function(){
            const {BorrowingLiquidationA} = await loadFixture(deployer);
            await expect(BorrowingLiquidationA.connect(owner).setTreasury(ZeroAddress)).to.be.revertedWith("Treasury must be contract address & can't be zero address");
        })

        it("Should revert if the caller is not owner for setAdmin",async function(){
            const {CDSContractA} = await loadFixture(deployer);
            await expect(CDSContractA.connect(user1).setAdmin(owner.getAddress())).to.be.revertedWith("Ownable: caller is not the owner");
        })

        it("Should revert if the Admin address is zero",async function(){
            const {CDSContractA} = await loadFixture(deployer);
            await expect(CDSContractA.connect(owner).setAdmin(ZeroAddress)).to.be.revertedWith("Admin can't be contract address & zero address");
        })

        it("Should revert if caller is not owner(setLTV)",async function(){
            const {BorrowingContractA} = await loadFixture(deployer);
            const tx = BorrowingContractA.connect(user1).setLTV(80);
            await expect(tx).to.be.revertedWith("Caller is not an admin");
        })

        it("Should revert if caller is not treasury(updateLastEthVaultValue)",async function(){
            const {BorrowingContractA} = await loadFixture(deployer);
            const tx = BorrowingContractA.connect(user1).updateLastEthVaultValue(100);
            await expect(tx).to.be.revertedWith("Function should only be called by treasury");
        })

        it("Should revert if ratio is not eligible",async function(){
            const {BorrowingContractB,CDSContractA,usdtA,treasuryA,globalVariablesA} = await loadFixture(deployer);
            const timeStamp = await time.latest();

            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()

            let nativeFee = 0
            ;[nativeFee] = await globalVariablesA.quote(1,0, options, false)

            await usdtA.connect(user1).mint(user1.getAddress(),100000000)
            await usdtA.connect(user1).approve(CDSContractA.getAddress(),100000000);
            await CDSContractA.connect(user1).deposit(100000000,0,true,50000000, { value: nativeFee.toString()});

            const tx = BorrowingContractB.connect(user1).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,1,
                ethers.parseEther("1")],
                {value: (ethers.parseEther("1") +  BigInt(nativeFee))})
            await expect(tx).to.be.revertedWith("Not enough fund in CDS");
        })

        it("Should return true if the address is contract address ",async function(){
            const {BorrowingContractA,treasuryA} = await loadFixture(deployer);
            const tx = await BorrowingContractA.isContract(await treasuryA.getAddress());
            await expect(tx).to.be.equal(true);
        })

        it("Should return false if the address is not contract address ",async function(){
            const {BorrowingContractA} = await loadFixture(deployer);
            const tx = await BorrowingContractA.isContract(user1.getAddress());
            await expect(tx).to.be.equal(false);
        })

        it("Should revert if called by other than borrowing contract",async function(){
            const {treasuryA} = await loadFixture(deployer);
            const timeStamp = await time.latest();
            const tx =  treasuryA.connect(user1).deposit(
                user1.getAddress(),
                100000,
                timeStamp,
                0,
                ethers.parseEther("1"),
                {value: ethers.parseEther("1")});
            await expect(tx).to.be.revertedWith("This function can only called by Core contracts");    
        })

        it("Should revert if called by other than borrowing contract",async function(){
            const {treasuryA} = await loadFixture(deployer);
            const tx =  treasuryA.connect(user1).withdraw(user1.getAddress(),user1.getAddress(),1000,ethers.parseEther('1'),1);
            await expect(tx).to.be.revertedWith("This function can only called by Core contracts");    
        })

        it("Should revert if called by other than CDS contract",async function(){
            const {treasuryA} = await loadFixture(deployer);
            const tx =  treasuryA.connect(user1).transferEthToCdsLiquidators(user1.getAddress(),1);
            await expect(tx).to.be.revertedWith("This function can only called by Core contracts");    
        })

        it("Should revert if the address is zero",async function(){
            const {treasuryA} = await loadFixture(deployer);
            await expect(treasuryA.connect(owner).withdrawInterest(ZeroAddress,0)).to.be.revertedWith("Input address or amount is invalid");
        })

        it("Should revert if the caller is not owner",async function(){
            const {treasuryA} = await loadFixture(deployer);
            await expect(treasuryA.connect(user1).withdrawInterest(user1.getAddress(),100)).to.be.revertedWith("Ownable: caller is not the owner");
        })

        it("Should revert if Treasury don't have enough interest",async function(){
            const {treasuryA} = await loadFixture(deployer);
            await expect(treasuryA.connect(owner).withdrawInterest(user1.getAddress(),100)).to.be.revertedWith("Treasury don't have enough interest");
        })

        it("Should revert if msg.value is less than depositing amount in borrow deposit",async function(){
            const {
                globalVariablesA,BorrowingContractB,
                CDSContractA,CDSContractB,
                usdtA,usdtB,
                treasuryA
            } = await loadFixture(deployer);
            const timeStamp = await time.latest();

            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()

            let nativeFee = 0
            ;[nativeFee] = await globalVariablesA.quote(1,0, options, false)
            
            const depositAmount = ethers.parseEther("50");

            const tx =  BorrowingContractB.connect(user2).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,1,
                (depositAmount + depositAmount)],
                {value: (depositAmount +  BigInt(nativeFee))})
            await expect(tx).to.be.revertedWith("Borrowing: Don't have enough LZ fee");
        })

        it("Should revert This function can only called by Core contracts",async function(){
            const { treasuryA } = await loadFixture(deployer);
            const tx = treasuryA.withdrawFromExternalProtocol(await user1.getAddress(),100);
            await expect(tx).to.be.revertedWith("This function can only called by Core contracts");
        })
        it("Should revert This function can only called by Core contracts",async function(){
            const { treasuryA } = await loadFixture(deployer);
            const tx = treasuryA.calculateYieldsForExternalProtocol(await user1.getAddress(),100);
            await expect(tx).to.be.revertedWith("This function can only called by Core contracts");
        })        
        it("Should revert This function can only called by Core contracts",async function(){
            const { treasuryA } = await loadFixture(deployer);
            const tx = treasuryA.updateDepositDetails(
                await user1.getAddress(),
                1,
            [1,2,3,4,5,6,78,false,9,true,4,5,2,4,5,6,7,8,0,1,2]);
            await expect(tx).to.be.revertedWith("This function can only called by Core contracts");
        })
        it("Should revert This function can only called by Core contracts",async function(){
            const { treasuryA } = await loadFixture(deployer);
            const tx = treasuryA.updateHasBorrowed(await user1.getAddress(),true);
            await expect(tx).to.be.revertedWith("This function can only called by Core contracts");
        })
        it("Should revert This function can only called by Core contracts",async function(){
            const { treasuryA } = await loadFixture(deployer);
            const tx = treasuryA.updateTotalDepositedAmount(await user1.getAddress(),100);
            await expect(tx).to.be.revertedWith("This function can only called by Core contracts");
        })
        it("Should revert This function can only called by Core contracts",async function(){
            const { treasuryA } = await loadFixture(deployer);
            const tx = treasuryA.updateTotalBorrowedAmount(await user1.getAddress(),100);
            await expect(tx).to.be.revertedWith("This function can only called by Core contracts");
        })
        it("Should revert This function can only called by Core contracts",async function(){
            const { treasuryA } = await loadFixture(deployer);
            const tx = treasuryA.updateTotalInterest(100);
            await expect(tx).to.be.revertedWith("This function can only called by Core contracts");
        })
        it("Should revert This function can only called by Core contracts",async function(){
            const { treasuryA } = await loadFixture(deployer);
            const tx = treasuryA.updateTotalInterestFromLiquidation(100);
            await expect(tx).to.be.revertedWith("This function can only called by Core contracts");
        })
        it("Should revert This function can only called by Core contracts",async function(){
            const { treasuryA } = await loadFixture(deployer);
            const tx = treasuryA.updateAbondUSDaPool(100,true);
            await expect(tx).to.be.revertedWith("This function can only called by Core contracts");
        })
        it("Should revert This function can only called by Core contracts",async function(){
            const { treasuryA } = await loadFixture(deployer);
            const tx = treasuryA.updateUSDaGainedFromLiquidation(100,true);
            await expect(tx).to.be.revertedWith("This function can only called by Core contracts");
        })
        // it("Should revert This function can only called by Core contracts",async function(){
        //     const { treasuryA } = await loadFixture(deployer);
        //     const tx = treasuryA.updateEthProfitsOfLiquidators(100,true);
        //     await expect(tx).to.be.revertedWith("This function can only called by Core contracts");
        // })
        it("Should revert This function can only called by Core contracts",async function(){
            const { treasuryA } = await loadFixture(deployer);
            const tx = treasuryA.updateInterestFromExternalProtocol(100);
            await expect(tx).to.be.revertedWith("This function can only called by Core contracts");
        })
        it("Should revert This function can only called by Core contracts",async function(){
            const { treasuryA } = await loadFixture(deployer);
            const tx = treasuryA.getExternalProtocolCumulativeRate(true);
            await expect(tx).to.be.revertedWith("This function can only called by Core contracts");
        })
        it("Should revert This function can only called by Core contracts",async function(){
            const { treasuryA } = await loadFixture(deployer);
            const tx = treasuryA.approveTokens(1,await user1.getAddress(),100);
            await expect(tx).to.be.revertedWith("This function can only called by Core contracts");
        })

        it("Should revert This function can only called by Core contracts",async function(){
            const { treasuryA } = await loadFixture(deployer);
            const tx = treasuryA.transferEthToCdsLiquidators(await user1.getAddress(),100);
            await expect(tx).to.be.revertedWith("This function can only called by Core contracts");
        })
    })

    describe("Should update all state changes correctly",function(){
        it("Should update deposited amount",async function(){
            const {BorrowingContractA,treasuryA,usdtB,CDSContractB,globalVariablesB} = await loadFixture(deployer);
            const timeStamp = await time.latest();
            await usdtB.connect(user1).mint(user1.getAddress(),10000000000)
            await usdtB.connect(user1).approve(CDSContractB.getAddress(),10000000000);

            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()

            let nativeFee = 0
            ;[nativeFee] = await globalVariablesB.quote(1,0, options, false)
 

            await CDSContractB.connect(user1).deposit(10000000000,0,true,10000000000, { value: nativeFee.toString()});
            await BorrowingContractA.connect(user1).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,1,
                ethers.parseEther("1")],
                {value: (ethers.parseEther("1") +  BigInt(nativeFee))})
            const tx = await treasuryA.borrowing(user1.getAddress());
            await expect(tx[0]).to.be.equal(ethers.parseEther("1"))
        })

        it("Should update depositedAmount correctly if deposited multiple times",async function(){
            const {BorrowingContractA,treasuryA,usdtB,CDSContractB,globalVariablesB} = await loadFixture(deployer);
            const timeStamp = await time.latest();
            await usdtB.connect(user1).mint(user1.getAddress(),10000000000)
            await usdtB.connect(user1).approve(CDSContractB.getAddress(),10000000000);

            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()

            let nativeFee = 0
            ;[nativeFee] = await globalVariablesB.quote(1,0, options, false)
 
            await CDSContractB.connect(user1).deposit(10000000000,0,true,10000000000, { value: nativeFee.toString()});
            await BorrowingContractA.connect(user1).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,1,
                ethers.parseEther("1")],
                {value: (ethers.parseEther("1") +  BigInt(nativeFee))})
            await BorrowingContractA.connect(user1).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,1,
                ethers.parseEther("2")],
                {value: (ethers.parseEther("2") +  BigInt(nativeFee))})
            await BorrowingContractA.connect(user1).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,1,
                ethers.parseEther("3")],
                {value: (ethers.parseEther("3") +  BigInt(nativeFee))})                    
            const tx = await treasuryA.borrowing(user1.getAddress());
            await expect(tx[0]).to.be.equal(ethers.parseEther("6"))
        })

        it("Should update hasDeposited or not",async function(){
            const {BorrowingContractA,treasuryA,usdtB,CDSContractB,globalVariablesB} = await loadFixture(deployer);
            const timeStamp = await time.latest();
            await usdtB.connect(user1).mint(user1.getAddress(),10000000000)
            await usdtB.connect(user1).approve(CDSContractB.getAddress(),10000000000);

            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()

            let nativeFee = 0
            ;[nativeFee] = await globalVariablesB.quote(1,0, options, false)
 
            await CDSContractB.connect(user1).deposit(10000000000,0,true,10000000000, { value: nativeFee.toString()});
            await BorrowingContractA.connect(user1).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,1,
                ethers.parseEther("1")],
                {value: (ethers.parseEther("1") +  BigInt(nativeFee))})
            const tx = await treasuryA.borrowing(user1.getAddress());
            await expect(tx[3]).to.be.equal(true);
        })

        it("Should update borrowerIndex",async function(){
            const {BorrowingContractA,treasuryA,usdtA,CDSContractA,globalVariablesA} = await loadFixture(deployer);
            const timeStamp = await time.latest();
            await usdtA.connect(user1).mint(user1.getAddress(),10000000000)
            await usdtA.connect(user1).approve(CDSContractA.getAddress(),10000000000);

            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()

            let nativeFee = 0
            ;[nativeFee] = await globalVariablesA.quote(1,0, options, false)
 
            await CDSContractA.connect(user1).deposit(10000000000,0,true,10000000000, { value: nativeFee.toString()});
            await BorrowingContractA.connect(user1).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,1,
                ethers.parseEther("1")],
                {value: (ethers.parseEther("1") +  BigInt(nativeFee))})
            const tx = await treasuryA.borrowing(user1.getAddress());
            const tx3 = await treasuryA.getBorrowing(user1.getAddress(), tx[4]);
            const tx4 = await CDSContractA.cdsDetails(user1.getAddress());
            const tx5 = await CDSContractA.getCDSDepositDetails(user1.getAddress(), tx4[0]);
            await expect(tx[4]).to.be.equal(1);
        })

        it("Should update borrowerIndex correctly if deposited multiple times",async function(){
            const {BorrowingContractA,treasuryA,usdtA,CDSContractA,globalVariablesA} = await loadFixture(deployer);
            const timeStamp = await time.latest();
            await usdtA.connect(user1).mint(user1.getAddress(),10000000000)
            await usdtA.connect(user1).approve(CDSContractA.getAddress(),10000000000);
            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()

            let nativeFee = 0
            ;[nativeFee] = await globalVariablesA.quote(1,0, options, false)
 
            await CDSContractA.connect(user1).deposit(10000000000,0,true,10000000000, { value: nativeFee.toString()});
            await BorrowingContractA.connect(user1).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,1,
                ethers.parseEther("1")],
                {value: (ethers.parseEther("1") +  BigInt(nativeFee))})
            await BorrowingContractA.connect(user1).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,1,
                ethers.parseEther("1")],
                {value: (ethers.parseEther("1") +  BigInt(nativeFee))})
            await BorrowingContractA.connect(user1).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,1,
                ethers.parseEther("1")],
                {value: (ethers.parseEther("1") +  BigInt(nativeFee))})                    
            const tx = await treasuryA.borrowing(user1.getAddress());
            await expect(tx[4]).to.be.equal(3);
        })

        it("Should update totalVolumeOfBorrowersinUSD",async function(){
            const {BorrowingContractA,treasuryA,usdtB,CDSContractB,globalVariablesB} = await loadFixture(deployer);
            const timeStamp = await time.latest();
            await usdtB.connect(user1).mint(user1.getAddress(),10000000000)
            await usdtB.connect(user1).approve(CDSContractB.getAddress(),10000000000);
            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()

            let nativeFee = 0
            ;[nativeFee] = await globalVariablesB.quote(1,0, options, false)
 
            await CDSContractB.connect(user1).deposit(10000000000,0,true,10000000000, { value: nativeFee.toString()});
            await BorrowingContractA.connect(user1).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,1,
                ethers.parseEther("2")],
                {value: (ethers.parseEther("2") +  BigInt(nativeFee))})
            await expect(await treasuryA.totalVolumeOfBorrowersAmountinUSD()).to.be.equal(ethers.parseEther("200000"));
        })

        it("Should update totalVolumeOfBorrowersinUSD if multiple users deposit in different ethPrice",async function(){
            const {BorrowingContractA,treasuryA,usdtA,CDSContractA,globalVariablesA} = await loadFixture(deployer);
            const timeStamp = await time.latest();
            await usdtA.connect(user1).mint(user1.getAddress(),10000000000)
            await usdtA.connect(user1).approve(CDSContractA.getAddress(),10000000000);
            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()

            let nativeFee = 0
            ;[nativeFee] = await globalVariablesA.quote(1,0, options, false)
 
            await CDSContractA.connect(user1).deposit(10000000000,0,true,10000000000, { value: nativeFee.toString()});
            await BorrowingContractA.connect(user1).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,1,
                ethers.parseEther("2")],
                {value: (ethers.parseEther("2") +  BigInt(nativeFee))})
            await BorrowingContractA.connect(user2).depositTokens(
                150000,
                timeStamp,
                [1,
                165000,
                ethVolatility,1,
                ethers.parseEther("2")],
                {value: (ethers.parseEther("2") +  BigInt(nativeFee))})
            await expect(await treasuryA.totalVolumeOfBorrowersAmountinUSD()).to.be.equal(ethers.parseEther("500000"));
        })

        it("Should update totalVolumeOfBorrowersinWei",async function(){
            const {BorrowingContractA,treasuryA,usdtA,CDSContractA,globalVariablesA} = await loadFixture(deployer);
            const timeStamp = await time.latest();
            await usdtA.connect(user1).mint(user1.getAddress(),10000000000)
            await usdtA.connect(user1).approve(CDSContractA.getAddress(),10000000000);

            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()

            let nativeFee = 0
            ;[nativeFee] = await globalVariablesA.quote(1,0, options, false)
 
            await CDSContractA.connect(user1).deposit(10000000000,0,true,10000000000, { value: nativeFee.toString()});
            await BorrowingContractA.connect(user1).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,1,
                ethers.parseEther("2")],
                {value: (ethers.parseEther("2") +  BigInt(nativeFee))})
            await BorrowingContractA.connect(user2).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,1,
                ethers.parseEther("3")],
                {value: (ethers.parseEther("3") +  BigInt(nativeFee))})
            await expect(await treasuryA.totalVolumeOfBorrowersAmountinWei()).to.be.equal(ethers.parseEther("5"));
        })

    })

    describe("Should withdraw ETH from protocol",function(){
        it("Should withdraw ETH (between 0.8 and 1)",async function(){
            const {BorrowingContractA,TokenA,globalVariablesA,usdtA,CDSContractA} = await loadFixture(deployer);
            const timeStamp = await time.latest();
            await usdtA.connect(user1).mint(user1.getAddress(),10000000000)
            await usdtA.connect(user1).approve(CDSContractA.getAddress(),10000000000);

            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()
            let nativeFee = 0
            ;[nativeFee] = await globalVariablesA.quote(1,0, options, false)
            await CDSContractA.connect(user1).deposit(10000000000,0,true,10000000000, { value: nativeFee.toString()});

            const depositAmount = ethers.parseEther("1");

            await BorrowingContractA.connect(user1).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,1,
                depositAmount],
                {value: (depositAmount +  BigInt(nativeFee))})
            
            const blockNumber = await ethers.provider.getBlockNumber(); // Get latest block number
            const latestBlock = await ethers.provider.getBlock(blockNumber);
            const latestTimestamp1 = latestBlock.timestamp;
            await time.increaseTo(latestTimestamp1 + 2592000);
            
            await BorrowingContractA.calculateCumulativeRate();
            await TokenA.mint(user1.getAddress(),80000000);
            await TokenA.connect(user1).approve(await BorrowingContractA.getAddress(),await TokenA.balanceOf(user1.getAddress()));

            await BorrowingContractA.connect(user1).withDraw(
                await user1.getAddress(), 
                1,
                99900,
                timeStamp,
                {value: nativeFee});

        })

        it("Should withdraw ETH(>1)",async function(){
            const {BorrowingContractA,TokenA,globalVariablesA,usdtA,CDSContractA} = await loadFixture(deployer);
            const timeStamp = await time.latest();
            await usdtA.connect(user1).mint(user1.getAddress(),10000000000)
            await usdtA.connect(user1).approve(CDSContractA.getAddress(),10000000000);

            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()
            let nativeFee = 0
            ;[nativeFee] = await globalVariablesA.quote(1,0, options, false)
            await CDSContractA.connect(user1).deposit(10000000000,0,true,10000000000, { value: nativeFee.toString()});

            const depositAmount = ethers.parseEther("1");

 

            await BorrowingContractA.connect(user1).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,1,
                depositAmount],
                {value: (depositAmount +  BigInt(nativeFee))})
            
            const blockNumber = await ethers.provider.getBlockNumber(); // Get latest block number
            const latestBlock = await ethers.provider.getBlock(blockNumber);
            const latestTimestamp1 = latestBlock.timestamp;
            await time.increaseTo(latestTimestamp1 + 2592000);
            
            await BorrowingContractA.calculateCumulativeRate();
            await TokenA.mint(user1.getAddress(),80000000);
            await TokenA.connect(user1).approve(await BorrowingContractA.getAddress(),await TokenA.balanceOf(user1.getAddress()));

            await BorrowingContractA.connect(user1).withDraw(
                await user1.getAddress(), 
                1,
                110000,
                timeStamp,
                {value: nativeFee});

        })

        it("Should withdraw ETH(=1)",async function(){
            const {BorrowingContractA,TokenA,globalVariablesA,usdtA,CDSContractA} = await loadFixture(deployer);
            const timeStamp = await time.latest();
            await usdtA.connect(user1).mint(user1.getAddress(),10000000000)
            await usdtA.connect(user1).approve(CDSContractA.getAddress(),10000000000);

            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()
            let nativeFee = 0
            ;[nativeFee] = await globalVariablesA.quote(1,0, options, false)
            await CDSContractA.connect(user1).deposit(10000000000,0,true,10000000000, { value: nativeFee.toString()});

            const depositAmount = ethers.parseEther("1");

 

            await BorrowingContractA.connect(user1).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,1,
                depositAmount],
                {value: (depositAmount +  BigInt(nativeFee))})
            
            const blockNumber = await ethers.provider.getBlockNumber(); // Get latest block number
            const latestBlock = await ethers.provider.getBlock(blockNumber);
            const latestTimestamp1 = latestBlock.timestamp;
            await time.increaseTo(latestTimestamp1 + 2592000);
            
            await BorrowingContractA.calculateCumulativeRate();
            await TokenA.mint(user1.getAddress(),80000000);
            await TokenA.connect(user1).approve(await BorrowingContractA.getAddress(),await TokenA.balanceOf(user1.getAddress()));

            await BorrowingContractA.connect(user1).withDraw(
                await user1.getAddress(), 
                1,
                100000,
                timeStamp,
                {value: nativeFee});

        })

        it("Should revert To address is zero and contract address",async function(){
            const {BorrowingContractA,treasuryA} = await loadFixture(deployer);
            const timeStamp = await time.latest();

            const tx = BorrowingContractA.connect(user1).withDraw(ZeroAddress,1,99900,timeStamp);
            await expect(tx).to.be.revertedWith("To address cannot be a zero and contract address");

            const tx1 = BorrowingContractA.connect(user1).withDraw(await treasuryA.getAddress(),1,99900,timeStamp);
            await expect(tx1).to.be.revertedWith("To address cannot be a zero and contract address");
        })

        it("Should revert if User doens't have the perticular index",async function(){
            const {BorrowingContractA,TokenA,globalVariablesA,usdtA,CDSContractA} = await loadFixture(deployer);
            const timeStamp = await time.latest();
            await usdtA.connect(user1).mint(user1.getAddress(),10000000000)
            await usdtA.connect(user1).approve(CDSContractA.getAddress(),10000000000);

            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()
            let nativeFee = 0
            ;[nativeFee] = await globalVariablesA.quote(1,0, options, false)
            await CDSContractA.connect(user1).deposit(10000000000,0,true,10000000000, { value: nativeFee.toString()});

            const depositAmount = ethers.parseEther("1");

            await BorrowingContractA.connect(user1).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,1,
                depositAmount],
                {value: (depositAmount +  BigInt(nativeFee))})
            
            const blockNumber = await ethers.provider.getBlockNumber(); // Get latest block number
            const latestBlock = await ethers.provider.getBlock(blockNumber);
            const latestTimestamp1 = latestBlock.timestamp;
            await time.increaseTo(latestTimestamp1 + 2592000);
            
            await BorrowingContractA.calculateCumulativeRate();
            await TokenA.mint(user1.getAddress(),80000000);
            await TokenA.connect(user1).approve(await BorrowingContractA.getAddress(),await TokenA.balanceOf(user1.getAddress()));

            const tx = BorrowingContractA.connect(user1).withDraw(
                await user1.getAddress(), 
                2,
                99900,
                timeStamp,
                {value: nativeFee});
            await expect(tx).to.be.revertedWith("User doens't have the perticular index");
        })

        it("Should revert if BorrowingHealth is Low",async function(){
            const {BorrowingContractA,TokenA,globalVariablesA,usdtA,CDSContractA} = await loadFixture(deployer);
            const timeStamp = await time.latest();
            await usdtA.connect(user1).mint(user1.getAddress(),10000000000)
            await usdtA.connect(user1).approve(CDSContractA.getAddress(),10000000000);

            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()
            let nativeFee = 0
            ;[nativeFee] = await globalVariablesA.quote(1,0, options, false)
            await CDSContractA.connect(user1).deposit(10000000000,0,true,10000000000, { value: nativeFee.toString()});

            const depositAmount = ethers.parseEther("1");

            await BorrowingContractA.connect(user1).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,1,
                depositAmount],
                {value: (depositAmount +  BigInt(nativeFee))})
            
            const blockNumber = await ethers.provider.getBlockNumber(); // Get latest block number
            const latestBlock = await ethers.provider.getBlock(blockNumber);
            const latestTimestamp1 = latestBlock.timestamp;
            await time.increaseTo(latestTimestamp1 + 2592000);
            
            await BorrowingContractA.calculateCumulativeRate();
            await TokenA.mint(user1.getAddress(),80000000);
            await TokenA.connect(user1).approve(await BorrowingContractA.getAddress(),await TokenA.balanceOf(user1.getAddress()));

            const tx = BorrowingContractA.connect(user1).withDraw(
                await user1.getAddress(), 
                1,
                80000,
                timeStamp,
                {value: nativeFee});
            await expect(tx).to.be.revertedWith("BorrowingHealth is Low");
        })

        it("Should revert if User already withdraw entire amount",async function(){
            const {BorrowingContractA,TokenA,globalVariablesA,usdtA,CDSContractA} = await loadFixture(deployer);
            const timeStamp = await time.latest();
            await usdtA.connect(user1).mint(user1.getAddress(),10000000000)
            await usdtA.connect(user1).approve(CDSContractA.getAddress(),10000000000);

            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()
            let nativeFee = 0
            ;[nativeFee] = await globalVariablesA.quote(1,0, options, false)
            await CDSContractA.connect(user1).deposit(10000000000,0,true,10000000000, { value: nativeFee.toString()});

            const depositAmount = ethers.parseEther("1");

            await BorrowingContractA.connect(user1).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,1,
                depositAmount],
                {value: (depositAmount +  BigInt(nativeFee))})

            await BorrowingContractA.connect(user1).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,1,
                depositAmount],
                {value: (depositAmount +  BigInt(nativeFee))})
            
            const blockNumber = await ethers.provider.getBlockNumber(); // Get latest block number
            const latestBlock = await ethers.provider.getBlock(blockNumber);
            const latestTimestamp1 = latestBlock.timestamp;
            await time.increaseTo(latestTimestamp1 + 2592000);
            
            await BorrowingContractA.calculateCumulativeRate();
            await TokenA.mint(user1.getAddress(),80000000);
            await TokenA.connect(user1).approve(await BorrowingContractA.getAddress(),await TokenA.balanceOf(user1.getAddress()));

            await BorrowingContractA.connect(user1).withDraw(
                await user1.getAddress(), 
                1,
                99900,
                timeStamp,
                {value: nativeFee});

            const tx = BorrowingContractA.connect(user1).withDraw(
                await user1.getAddress(), 
                1,
                99900,
                timeStamp,
                {value: nativeFee});
            await expect(tx).to.be.revertedWith("User already withdraw entire amount");
        })

        it("Should revert if User amount has been liquidated",async function(){
            const {BorrowingContractB,CDSContractA,globalVariablesA,usdtA,treasuryB} = await loadFixture(deployer);
            const timeStamp = await time.latest();

            await usdtA.connect(user1).mint(user1.getAddress(),10000000000);
            await usdtA.connect(user1).approve(CDSContractA.getAddress(),10000000000);
            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()

            let nativeFee = 0
            ;[nativeFee] = await globalVariablesA.quote(1,0, options, false)
            await CDSContractA.connect(user1).deposit(10000000000,0,true,10000000000, { value: nativeFee.toString()});
            
            const depositAmount = ethers.parseEther("1");

            await BorrowingContractB.connect(user2).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,1,
                depositAmount],
                {value: (depositAmount +  BigInt(nativeFee))})

            const blockNumber = await ethers.provider.getBlockNumber(); // Get latest block number
            const latestBlock = await ethers.provider.getBlock(blockNumber);
            const latestTimestamp1 = latestBlock.timestamp;
            await time.increaseTo(latestTimestamp1 + 2592000);

            const optionsA = Options.newOptions().addExecutorLzReceiveOption(1100000, 0).toHex().toString()
            let nativeFee1 = 0
            ;[nativeFee1] = await globalVariablesA.quote(3,0, optionsA, false)
            await BorrowingContractB.connect(owner).liquidate(
                await user2.getAddress(),
                1,
                80000,
                {value: nativeFee1})
            const tx = BorrowingContractB.connect(user2).withDraw(
                await user2.getAddress(), 
                1,
                99900,
                timeStamp,
                {value: nativeFee1});            
            await expect(tx).to.be.revertedWith("User amount has been liquidated");
        })

        it("Should revert User balance is less than required",async function(){
            const {BorrowingContractA,TokenA,globalVariablesA,usdtA,CDSContractA} = await loadFixture(deployer);
            const timeStamp = await time.latest();
            await usdtA.connect(user1).mint(user1.getAddress(),10000000000)
            await usdtA.connect(user1).approve(CDSContractA.getAddress(),10000000000);

            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()
            let nativeFee = 0
            ;[nativeFee] = await globalVariablesA.quote(1,0, options, false)
            await CDSContractA.connect(user1).deposit(10000000000,0,true,10000000000, { value: nativeFee.toString()});

            const depositAmount = ethers.parseEther("1");

            await BorrowingContractA.connect(user1).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,1,
                depositAmount],
                {value: (depositAmount +  BigInt(nativeFee))})
            
            const blockNumber = await ethers.provider.getBlockNumber(); // Get latest block number
            const latestBlock = await ethers.provider.getBlock(blockNumber);
            const latestTimestamp1 = latestBlock.timestamp;
            await time.increaseTo(latestTimestamp1 + 2592000);
            
            await BorrowingContractA.calculateCumulativeRate();
            await TokenA.connect(user1).approve(await BorrowingContractA.getAddress(),await TokenA.balanceOf(user1.getAddress()));

            const tx =  BorrowingContractA.connect(user1).withDraw(
                await user1.getAddress(), 
                1,
                99900,
                timeStamp,
                {value: nativeFee});
            await expect(tx).to.be.revertedWith("User balance is less than required");
        })
    })

    describe("Should Liquidate ETH from protocol",function(){
        it("Should Liquidate ETH",async function(){
            const {BorrowingContractB,CDSContractA,usdtA,globalVariablesA} = await loadFixture(deployer);
            const timeStamp = await time.latest();

            await usdtA.connect(user1).mint(user1.getAddress(),10000000000);
            await usdtA.connect(user1).approve(CDSContractA.getAddress(),10000000000);
            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()

            let nativeFee = 0
            ;[nativeFee] = await globalVariablesA.quote(1,0, options, false)
            await CDSContractA.connect(user1).deposit(10000000000,0,true,10000000000, { value: nativeFee.toString()});
            
            const depositAmount = ethers.parseEther("1");

            await BorrowingContractB.connect(user2).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,1,
                depositAmount],
                {value: (depositAmount +  BigInt(nativeFee))})

            const blockNumber = await ethers.provider.getBlockNumber(); // Get latest block number
            const latestBlock = await ethers.provider.getBlock(blockNumber);
            const latestTimestamp1 = latestBlock.timestamp;
            await time.increaseTo(latestTimestamp1 + 2592000);

            const optionsA = Options.newOptions().addExecutorLzReceiveOption(1100000, 0).toHex().toString()
            let nativeFee1 = 0
            ;[nativeFee1] = await globalVariablesA.quote(3,0, optionsA, false)
            await BorrowingContractB.connect(owner).liquidate(
                await user2.getAddress(),
                1,
                80000,
                {value: nativeFee1})
        })

        it("Should revert Already liquidated",async function(){
            const {BorrowingContractB,CDSContractA,usdtA,globalVariablesA,treasuryB} = await loadFixture(deployer);
            const timeStamp = await time.latest();

            await usdtA.connect(user1).mint(user1.getAddress(),10000000000);
            await usdtA.connect(user1).approve(CDSContractA.getAddress(),10000000000);
            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()

            let nativeFee = 0
            ;[nativeFee] = await globalVariablesA.quote(1,0, options, false)
            await CDSContractA.connect(user1).deposit(10000000000,0,true,10000000000, { value: nativeFee.toString()});
            
            const depositAmount = ethers.parseEther("1");

            await BorrowingContractB.connect(user2).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,1,
                depositAmount],
                {value: (depositAmount +  BigInt(nativeFee))})

            const blockNumber = await ethers.provider.getBlockNumber(); // Get latest block number
            const latestBlock = await ethers.provider.getBlock(blockNumber);
            const latestTimestamp1 = latestBlock.timestamp;
            await time.increaseTo(latestTimestamp1 + 2592000);

            const optionsA = Options.newOptions().addExecutorLzReceiveOption(1100000, 0).toHex().toString()
            let nativeFee1 = 0
            ;[nativeFee1] = await globalVariablesA.quote(3,0, optionsA, false)

            await BorrowingContractB.connect(owner).liquidate(
                await user2.getAddress(),
                1,
                80000,
                {value: (nativeFee1)})

            const tx = BorrowingContractB.connect(owner).liquidate(
                await user2.getAddress(),
                1,
                80000,
                {value: nativeFee1})
            await expect(tx).to.be.revertedWith('Already Liquidated');
        })

        it("Should revert if other than admin tried to Liquidate",async function(){
            const {BorrowingContractA} = await loadFixture(deployer);
            
            const tx = BorrowingContractA.connect(user2).liquidate(user1.getAddress(),1,80000);
            await expect(tx).to.be.revertedWith('Caller is not an admin');
        })

        it("Should revert To address is zero",async function(){
            const {BorrowingContractA,globalVariablesA,treasuryB} = await loadFixture(deployer);

            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()

            let nativeFee = 0
            ;[nativeFee] = await globalVariablesA.quote(1,0, options, false)

            const tx = BorrowingContractA.connect(owner).liquidate(ethers.ZeroAddress,1,100000,{value: nativeFee});
            await expect(tx).to.be.revertedWith("To address cannot be a zero address");
        })

        it("Should revert You cannot liquidate your own assets!",async function(){
            const {BorrowingContractA,globalVariablesA,treasuryB} = await loadFixture(deployer);

            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()

            let nativeFee = 0
            ;[nativeFee] = await globalVariablesA.quote(1,0, options, false)

            const optionsA = Options.newOptions().addExecutorLzReceiveOption(600000, 0).toHex().toString()

            const tx = BorrowingContractA.connect(owner).liquidate(owner.getAddress(),1,100000,{value: nativeFee});
            await expect(tx).to.be.revertedWith("You cannot liquidate your own assets!");
        })

        it("Should revert You cannot liquidate",async function(){
            const {BorrowingContractB,CDSContractA,usdtA,globalVariablesA,treasuryB} = await loadFixture(deployer);
            const timeStamp = await time.latest();

            await usdtA.connect(user1).mint(user1.getAddress(),10000000000);
            await usdtA.connect(user1).approve(CDSContractA.getAddress(),10000000000);
            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()

            let nativeFee = 0
            ;[nativeFee] = await globalVariablesA.quote(1,0, options, false)
            await CDSContractA.connect(user1).deposit(10000000000,0,true,10000000000, { value: nativeFee.toString()});
            
            const depositAmount = ethers.parseEther("1");

            await BorrowingContractB.connect(user2).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,1,
                depositAmount],
                {value: (depositAmount +  BigInt(nativeFee))})

            const blockNumber = await ethers.provider.getBlockNumber(); // Get latest block number
            const latestBlock = await ethers.provider.getBlock(blockNumber);
            const latestTimestamp1 = latestBlock.timestamp;
            await time.increaseTo(latestTimestamp1 + 2592000);

            const optionsA = Options.newOptions().addExecutorLzReceiveOption(600000, 0).toHex().toString()
            
            const tx = BorrowingContractB.connect(owner).liquidate(
                await user2.getAddress(),
                1,
                100000,
                {value: nativeFee})
            await expect(tx).to.be.revertedWith("You cannot liquidate, ratio is greater than 0.8");
        })
    })

    describe("Should revert multisign errors",function(){
        it("Should revert if non owner tried to approve pausing",async function(){
            const {multiSignA} = await loadFixture(deployer);
            await expect(multiSignA.connect(user1).approvePause([0])).to.be.revertedWith("Not an owner");
        })

        it("Should revert if non owner tried to approve unpausing",async function(){
            const {multiSignA} = await loadFixture(deployer);
            await expect(multiSignA.connect(user1).approveUnPause([2])).to.be.revertedWith("Not an owner");
        })

        it("Should revert if tried to approve pausing twice ",async function(){
            const {multiSignA} = await loadFixture(deployer);
            await multiSignA.connect(owner).approvePause([0]);
            await expect(multiSignA.connect(owner).approvePause([0])).to.be.revertedWith('Already approved');
        })

        it("Should revert caller is not the owner if tried to pause Borrowing",async function(){
            const {multiSignA} = await loadFixture(deployer);
            await multiSignA.connect(owner).approvePause([1]);
            await multiSignA.connect(owner1).approvePause([1]);
            await expect(multiSignA.connect(user1).pauseFunction([1])).to.be.revertedWith("Not an owner");
        })

        it("Should revert caller is not the owner if tried to unpause Borrowing",async function(){
            const {multiSignA} = await loadFixture(deployer);
            await multiSignA.connect(owner).approveUnPause([0]);
            await multiSignA.connect(owner1).approveUnPause([0]);
            await expect(multiSignA.connect(user1).unpauseFunction([1])).to.be.revertedWith("Not an owner");
        })

        it("Should revert if tried to pause Borrowing before attaining required approvals",async function(){
            const {multiSignA} = await loadFixture(deployer);
            await multiSignA.connect(owner).approvePause([1]);
            await expect(multiSignA.connect(owner).pauseFunction([1])).to.be.revertedWith('Required approvals not met');
        })

        it("Should revert if tried to unpause Borrowing before attaining required approvals",async function(){
            const {multiSignA} = await loadFixture(deployer);
            await multiSignA.connect(owner).approvePause([1]);
            await multiSignA.connect(owner1).approvePause([1]);
            await multiSignA.connect(owner).pauseFunction([1]);

            await multiSignA.connect(owner).approveUnPause([1]);
            await expect(multiSignA.connect(owner).unpauseFunction([1])).to.be.revertedWith('Required approvals not met');
        })

        it("Should revert if tried to deposit ETH in borrowing when it is paused",async function(){
            const {BorrowingContractA,multiSignA} = await loadFixture(deployer);
            const timeStamp = await time.latest();
            await multiSignA.connect(owner).approvePause([0]);
            await multiSignA.connect(owner1).approvePause([0]);
            await multiSignA.connect(owner).pauseFunction([0]);

            const tx = BorrowingContractA.connect(user2).depositTokens(100000,timeStamp,
                [1,110000,ethVolatility,1,ethers.parseEther("1")],{value: ethers.parseEther("1")});
            expect(tx).to.be.revertedWith('Paused');
        })

        it("Should r]evert if tried to deposit USDT or USDa in CDS when it is paused",async function(){
            const {CDSContractA,multiSignA,usdtA} = await loadFixture(deployer);
            await multiSignA.connect(owner).approvePause([4]);
            await multiSignA.connect(owner1).approvePause([4]);
            await multiSignA.connect(owner).pauseFunction([4]);

            await usdtA.connect(user1).mint(user1.getAddress(),10000000000)
            await usdtA.connect(user1).approve(CDSContractA.getAddress(),10000000000);
            const tx = CDSContractA.connect(user1).deposit(10000000000,0,true,10000000000);
            await expect(tx).to.be.revertedWith('Paused');
        })

        it("Should revert if tried to redeem USDT in cds when it is paused",async function(){
            const {CDSContractA,multiSignA} = await loadFixture(deployer);
            await multiSignA.connect(owner).approvePause([6]);
            await multiSignA.connect(owner1).approvePause([6]);
            await multiSignA.connect(owner).pauseFunction([6]);

            const tx = CDSContractA.connect(user2).redeemUSDT(ethers.parseEther("800"),1500,1000);
            await expect(tx).to.be.revertedWith('Paused');
        })

        it("Should revert if tried to withdraw ETH in borrowing when it is paused",async function(){
            const {BorrowingContractA,multiSignA} = await loadFixture(deployer);
            const timeStamp = await time.latest();

            await multiSignA.connect(owner).approvePause([1]);
            await multiSignA.connect(owner1).approvePause([1]);
            await multiSignA.connect(owner).pauseFunction([1]);
            const tx = BorrowingContractA.connect(user2).withDraw(user2.getAddress(),1,99900,timeStamp);
            await expect(tx).to.be.revertedWith('Paused');
        })

        it("Should revert if tried to withdraw USDa in CDS when it is paused",async function(){
            const {CDSContractA,multiSignA} = await loadFixture(deployer);

            await multiSignA.connect(owner).approvePause([5]);
            await multiSignA.connect(owner1).approvePause([5]);
            await multiSignA.connect(owner).pauseFunction([5]);
            
            const tx = CDSContractA.connect(user1).withdraw(1);

            await expect(tx).to.be.revertedWith('Paused');
        })

        it("Should revert if tried to Liquidate in borrowing when it is paused",async function(){
            const {BorrowingContractA,multiSignA} = await loadFixture(deployer);
            
            await multiSignA.connect(owner).approvePause([2]);
            await multiSignA.connect(owner1).approvePause([2]);
            await multiSignA.connect(owner).pauseFunction([2]);
            
            const tx = BorrowingContractA.liquidate(user1.getAddress(),1,80000);
            await expect(tx).to.be.revertedWith('Paused');
        })
    })

    describe("Should ABOND be fungible",function(){
        it("Should store genesis cumulative rate correctly",async function(){
            const {
                globalVariablesA,BorrowingContractB,
                CDSContractA,CDSContractB,
                usdtA,usdtB,
                treasuryA,abondTokenB
            } = await loadFixture(deployer);
            const timeStamp = await time.latest();

            await usdtA.connect(user1).mint(user1.getAddress(),10000000000);
            await usdtA.connect(user1).approve(CDSContractA.getAddress(),10000000000);
            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()

            let nativeFee = 0
            ;[nativeFee] = await globalVariablesA.quote(1,0, options, false)
            await CDSContractA.connect(user1).deposit(10000000000,0,true,10000000000, { value: nativeFee.toString()});

            await usdtB.connect(user1).mint(user1.getAddress(),10000000000);
            await usdtB.connect(user1).approve(CDSContractB.getAddress(),10000000000);
            await CDSContractB.connect(user1).deposit(10000000000,0,true,10000000000, { value: nativeFee.toString()});
            
            const depositAmount = ethers.parseEther("50");

 

            await BorrowingContractB.connect(user2).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,1,
                depositAmount],
                {value: (depositAmount +  BigInt(nativeFee))})

            const tx = await abondTokenB.userStatesAtDeposits(user2.address, 1);
            await expect(tx[0]).to.be.equal(1000000000000000000000000000n)
        })
            
        it("Should store eth backed during deposit correctly",async function(){
            const {
                globalVariablesA,BorrowingContractB,
                CDSContractA,CDSContractB,
                usdtA,usdtB,
                treasuryA,abondTokenB
            } = await loadFixture(deployer);
            const timeStamp = await time.latest();

            await usdtA.connect(user1).mint(user1.getAddress(),10000000000);
            await usdtA.connect(user1).approve(CDSContractA.getAddress(),10000000000);
            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()

            let nativeFee = 0
            ;[nativeFee] = await globalVariablesA.quote(1,0, options, false)
            await CDSContractA.connect(user1).deposit(10000000000,0,true,10000000000, { value: nativeFee.toString()});

            await usdtB.connect(user1).mint(user1.getAddress(),10000000000);
            await usdtB.connect(user1).approve(CDSContractB.getAddress(),10000000000);
            await CDSContractB.connect(user1).deposit(10000000000,0,true,10000000000, { value: nativeFee.toString()});
            
            const depositAmount = ethers.parseEther("1");

 

            await BorrowingContractB.connect(user2).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,1,
                depositAmount],
                {value: (depositAmount +  BigInt(nativeFee))})
            
            const tx = await abondTokenB.userStatesAtDeposits(user2.address, 1);
            await expect(tx[1]).to.be.equal(500000000000000000n);
        })

        it("Should store cumulative rate and eth backed after withdraw correctly",async function(){
            const {BorrowingContractA,TokenA,globalVariablesA,usdtA,CDSContractA,abondTokenA} = await loadFixture(deployer);
            const timeStamp = await time.latest();
            await usdtA.connect(user1).mint(user1.getAddress(),10000000000)
            await usdtA.connect(user1).approve(CDSContractA.getAddress(),10000000000);

            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()
            let nativeFee = 0
            ;[nativeFee] = await globalVariablesA.quote(1,0, options, false)
            await CDSContractA.connect(user1).deposit(10000000000,0,true,10000000000, { value: nativeFee.toString()});

            const depositAmount = ethers.parseEther("1");

 

            await BorrowingContractA.connect(user1).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,1,
                depositAmount],
                {value: (depositAmount +  BigInt(nativeFee))})
            
            const blockNumber = await ethers.provider.getBlockNumber(); // Get latest block number
            const latestBlock = await ethers.provider.getBlock(blockNumber);
            const latestTimestamp1 = latestBlock.timestamp;
            await time.increaseTo(latestTimestamp1 + 2592000);
            
            await BorrowingContractA.calculateCumulativeRate();
            await TokenA.mint(user1.getAddress(),80000000);
            await TokenA.connect(user1).approve(await BorrowingContractA.getAddress(),await TokenA.balanceOf(user1.getAddress()));

            await BorrowingContractA.connect(user1).withDraw(
                await user1.getAddress(), 
                1,
                99900,
                timeStamp,
                {value: nativeFee});

            const tx = await abondTokenA.userStates(user1.address);
            await expect(tx[0]).to.be.equal(1000000000000000000000000000n);
            const abondBalance = ((500000000000000000 * 999 * 0.8)/4);
            const ethBackedPerAbond = BigInt(500000000000000000 * 1e18/abondBalance);
            await expect(tx[2]).to.be.equal(BigInt(abondBalance));
            await expect(tx[1]).to.be.equal(ethBackedPerAbond);
            await expect(tx[0]).to.be.equal(1000000000000000000000000000n)
        })

        it("Should store cumulative rate and eth backed for multiple index correctly",async function(){
            const {BorrowingContractA,TokenA,globalVariablesA,usdtA,CDSContractA,abondTokenA} = await loadFixture(deployer);
            const timeStamp = await time.latest();
            await usdtA.connect(user1).mint(user1.getAddress(),10000000000)
            await usdtA.connect(user1).approve(CDSContractA.getAddress(),10000000000);

            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()
            let nativeFee = 0
            ;[nativeFee] = await globalVariablesA.quote(1,0, options, false)
            await CDSContractA.connect(user1).deposit(10000000000,0,true,10000000000, { value: nativeFee.toString()});

            const depositAmount = ethers.parseEther("1");

            await BorrowingContractA.connect(user1).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,1,
                depositAmount],
                {value: (depositAmount +  BigInt(nativeFee))})

                
                await BorrowingContractA.connect(user1).depositTokens(
                    100000,
                    timeStamp,
                    [1,
                    110000,
                    ethVolatility,1,
                    depositAmount],
                    {value: (depositAmount +  BigInt(nativeFee))})
            
            const blockNumber = await ethers.provider.getBlockNumber(); // Get latest block number
            const latestBlock = await ethers.provider.getBlock(blockNumber);
            const latestTimestamp1 = latestBlock.timestamp;
            await time.increaseTo(latestTimestamp1 + 2592000);
            
            await BorrowingContractA.calculateCumulativeRate();
            await TokenA.mint(user1.getAddress(),800000000);
            await TokenA.connect(user1).approve(await BorrowingContractA.getAddress(),await TokenA.balanceOf(user1.getAddress()));

            await BorrowingContractA.connect(user1).withDraw(
                await user1.getAddress(), 
                1,
                99900,
                timeStamp,
                {value: nativeFee});

            const blockNumber1 = await ethers.provider.getBlockNumber(); // Get latest block number
            const latestBlock1 = await ethers.provider.getBlock(blockNumber1);
            const latestTimestamp2 = latestBlock1.timestamp;
            await time.increaseTo(latestTimestamp2 + 2592000);
                
            await BorrowingContractA.calculateCumulativeRate();
            await TokenA.mint(user1.getAddress(),80000000);
            await TokenA.connect(user1).approve(await BorrowingContractA.getAddress(),await TokenA.balanceOf(user1.getAddress()));
    
            await BorrowingContractA.connect(user1).withDraw(
                await user1.getAddress(), 
                2,
                99500,
                timeStamp,
                {value: nativeFee});

            const tx = await abondTokenA.userStates(user1.address);

            const abondBalance1 = ((500000000000000000 * 999 * 0.8)/4);
            const abondBalance2 = ((500000000000000000 * 995 * 0.8)/4);

            await expect(tx[2]).to.be.equal(BigInt(abondBalance1+abondBalance2));
        })

        it("Should redeem abond",async function(){
            const {BorrowingContractA,TokenA,globalVariablesA,usdtA,CDSContractA,abondTokenA} = await loadFixture(deployer);
            const timeStamp = await time.latest();
            await usdtA.connect(user1).mint(user1.getAddress(),10000000000)
            await usdtA.connect(user1).approve(CDSContractA.getAddress(),10000000000);

            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()
            let nativeFee = 0
            ;[nativeFee] = await globalVariablesA.quote(1,0, options, false)
            await CDSContractA.connect(user1).deposit(10000000000,0,true,10000000000, { value: nativeFee.toString()});

            const depositAmount = ethers.parseEther("1");

            await BorrowingContractA.connect(user1).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,1,
                depositAmount],
                {value: (depositAmount +  BigInt(nativeFee))})
            
            const blockNumber = await ethers.provider.getBlockNumber(); // Get latest block number
            const latestBlock = await ethers.provider.getBlock(blockNumber);
            const latestTimestamp1 = latestBlock.timestamp;
            await time.increaseTo(latestTimestamp1 + 2592000);
            
            await BorrowingContractA.calculateCumulativeRate();
            await TokenA.mint(user1.getAddress(),80000000);
            await TokenA.connect(user1).approve(await BorrowingContractA.getAddress(),await TokenA.balanceOf(user1.getAddress()));

            await BorrowingContractA.connect(user1).withDraw(
                await user1.getAddress(), 
                1,
                99900,
                timeStamp,
                {value: nativeFee});

            await abondTokenA.connect(user1).approve(await BorrowingContractA.getAddress(), await abondTokenA.balanceOf(user1.address));
            await BorrowingContractA.connect(user1).redeemYields(await user1.getAddress(), await abondTokenA.balanceOf(await user1.getAddress()));
        })

        // it("Should store cumulative rate and eth backed for multiple transfers correctly",async function(){
        //     const {BorrowingContract,Token,usdt,CDSContract} = await loadFixture(deployer);
        //     const timeStamp = await time.latest();
        //     await usdt.connect(user1).mint(user1.getAddress(),10000000000)
        //     await usdt.connect(user1).approve(CDSContract.getAddress(),10000000000);
        //     await CDSContract.connect(user1).deposit(10000000000,0,true,10000000000);

        //     await BorrowingContract.connect(user1).depositTokens(100000,timeStamp,
        //     1,110000,ethVolatility,0,{value: ethers.parseEther("1")}    
        //     const blockNumber = await ethers.provider.getBlockNumber(); // Get latest block number
        //     const latestBlock = await ethers.provider.getBlock(blockNumber);
        //     const latestTimestamp1 = latestBlock.timestamp;
        // ]    await time.increaseTo(latestTimestamp1 + 2592000);

        //     await BorrowingContract.calculateCumulativeRate();
        //     await Token.connect(user1).mint(user1.address, 50000000);
        //     await Token.connect(user1).approve(await BorrowingContract.getAddress(),await Token.balanceOf(user1.getAddress()));
        //     await BorrowingContract.connect(user1).withDraw(user1.getAddress(),1,99900,timeStamp);

        //     await BorrowingContract.connect(user1).depositTokens(100000,timeStamp,
        //     1,110000,ethVolatility,0,{value: ethers.parseEther("1

        //     const blockNumber1 = await ethers.provider.getBlockNumber(); // Get latest block number
        //     const latestBlock1 = await ethers.provider.getBlock(blockNu]mber1);
        //     const latestTimestamp2 = latestBlock1.timestamp;
        //     await time.increaseTo(latestTimestamp2 + 2592000);

        //     await BorrowingContract.calculateCumulativeRate();
        //     await Token.connect(user1).mint(user1.address, 5000000);
        //     await Token.connect(user1).approve(await BorrowingContract.getAddress(),await Token.balanceOf(user1.getAddress()));
        //     await BorrowingContract.connect(user1).withDraw(user1.getAddress(),2,99000,timeStamp);

        //     // await abondToken.connect(user1).approve(await BorrowingContract.getAddress(), await abondToken.balanceOf(user1.address));
        //     // await BorrowingContract.connect(user1).redeemYields(await user1.getAddress(), await abondToken.balanceOf(await user1.getAddress()));
        // })

        it("Should get withdraw amount",async function(){
            const {BorrowingContractA,TokenA,globalVariablesA,usdtA,CDSContractA,abondTokenA} = await loadFixture(deployer);
            const timeStamp = await time.latest();
            await usdtA.connect(user1).mint(user1.getAddress(),10000000000)
            await usdtA.connect(user1).approve(CDSContractA.getAddress(),10000000000);

            const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()
            let nativeFee = 0
            ;[nativeFee] = await globalVariablesA.quote(1,0, options, false)
            await CDSContractA.connect(user1).deposit(10000000000,0,true,10000000000, { value: nativeFee.toString()});

            const depositAmount = ethers.parseEther("1");

 

            await BorrowingContractA.connect(user1).depositTokens(
                100000,
                timeStamp,
                [1,
                110000,
                ethVolatility,1,
                depositAmount],
                {value: (depositAmount +  BigInt(nativeFee))})
            
            const blockNumber = await ethers.provider.getBlockNumber(); // Get latest block number
            const latestBlock = await ethers.provider.getBlock(blockNumber);
            const latestTimestamp1 = latestBlock.timestamp;
            await time.increaseTo(latestTimestamp1 + 2592000);
            
            await BorrowingContractA.calculateCumulativeRate();
            await TokenA.mint(user1.getAddress(),80000000);
            await TokenA.connect(user1).approve(await BorrowingContractA.getAddress(),await TokenA.balanceOf(user1.getAddress()));

            await BorrowingContractA.connect(user1).withDraw(
                await user1.getAddress(), 
                1,
                99900,
                timeStamp,
                {value: nativeFee});

            const tx = await BorrowingContractA.getAbondYields(user1.getAddress(), await abondTokenA.balanceOf(user1.getAddress()));
        })

    })

    describe("Should change apr based on USDa price", function(){
        it("Should change the apr $0.90",async function(){
            const {
                BorrowingContractA,BorrowingContractB,
                CDSContractA,CDSContractB,
                usdtA,usdtB,
                treasuryA,abondTokenB
            } = await loadFixture(deployer);

            await BorrowingContractA.connect(owner).updateRatePerSecByUSDaPrice(9000);
            expect(await BorrowingContractA.ratePerSec()).to.be.equal(BigInt('1000000007075835619725814915'));
        })
        it("Should change the apr for $0.95",async function(){
            const {
                BorrowingContractA,BorrowingContractB,
                CDSContractA,CDSContractB,
                usdtA,usdtB,
                treasuryA,abondTokenB
            } = await loadFixture(deployer);

            await BorrowingContractA.connect(owner).updateRatePerSecByUSDaPrice(9500);
            expect(await BorrowingContractA.ratePerSec()).to.be.equal(BigInt('1000000004431822129783699001'));
        })
        it("Should change the apr $0.975",async function(){
            const {
                BorrowingContractA,BorrowingContractB,
                CDSContractA,CDSContractB,
                usdtA,usdtB,
                treasuryA,abondTokenB
            } = await loadFixture(deployer);

            await BorrowingContractA.connect(owner).updateRatePerSecByUSDaPrice(9750);
            expect(await BorrowingContractA.ratePerSec()).to.be.equal(BigInt('1000000003022265980097387650'));
        })
        it("Should change the apr $0.985",async function(){
            const {
                BorrowingContractA,BorrowingContractB,
                CDSContractA,CDSContractB,
                usdtA,usdtB,
                treasuryA,abondTokenB
            } = await loadFixture(deployer);

            await BorrowingContractA.connect(owner).updateRatePerSecByUSDaPrice(9850);
            expect(await BorrowingContractA.ratePerSec()).to.be.equal(BigInt('1000000002293273137447730714'));
        })
        it("Should change the apr $1.00",async function(){
            const {
                BorrowingContractA,BorrowingContractB,
                CDSContractA,CDSContractB,
                usdtA,usdtB,
                treasuryA,abondTokenB
            } = await loadFixture(deployer);

            await BorrowingContractA.connect(owner).updateRatePerSecByUSDaPrice(10000);
            expect(await BorrowingContractA.ratePerSec()).to.be.equal(BigInt('1000000001547125957863212448'));
        })
        it("Should change the apr $1.015",async function(){
            const {
                BorrowingContractA,BorrowingContractB,
                CDSContractA,CDSContractB,
                usdtA,usdtB,
                treasuryA,abondTokenB
            } = await loadFixture(deployer);

            await BorrowingContractA.connect(owner).updateRatePerSecByUSDaPrice(10150);
            expect(await BorrowingContractA.ratePerSec()).to.be.equal(BigInt('1000000001243680656318820312'));
        })
        it("Should change the apr $1.045",async function(){
            const {
                BorrowingContractA,BorrowingContractB,
                CDSContractA,CDSContractB,
                usdtA,usdtB,
                treasuryA,abondTokenB
            } = await loadFixture(deployer);

            await BorrowingContractA.connect(owner).updateRatePerSecByUSDaPrice(10450);
            expect(await BorrowingContractA.ratePerSec()).to.be.equal(BigInt('1000000000782997609082909351'));
        })
        it("Should change the apr $1.1",async function(){
            const {
                BorrowingContractA,BorrowingContractB,
                CDSContractA,CDSContractB,
                usdtA,usdtB,
                treasuryA,abondTokenB
            } = await loadFixture(deployer);

            await BorrowingContractA.connect(owner).updateRatePerSecByUSDaPrice(11000);
            await expect(await BorrowingContractA.ratePerSec()).to.be.equal(BigInt('1000000000158153903837946257'));
        })
    })

    describe("Should able to deposit different collaterals", function(){
        it("Should deposit WeETH in Borrow",async function(){
            const {
                BorrowingContractA,weETHA,
                CDSContractA,
                usdtA,treasuryA
                ,globalVariablesA
            } = await loadFixture(deployer);
            const timeStamp = await time.latest();

            await usdtA.connect(user1).mint(user1.getAddress(),10000000000);
            await usdtA.connect(user1).approve(CDSContractA.getAddress(),10000000000);
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
                {value: BigInt(nativeFee)})
        })

        it("Should withdraw WeETH in Borrow",async function(){
            const {
                BorrowingContractA,weETHA,
                CDSContractA,
                usdtA,treasuryA,TokenA
                ,globalVariablesA
            } = await loadFixture(deployer);
            const timeStamp = await time.latest();

            await usdtA.connect(user1).mint(user1.getAddress(),10000000000);
            await usdtA.connect(user1).approve(CDSContractA.getAddress(),10000000000);
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
                {value: BigInt(nativeFee)})

            const blockNumber = await ethers.provider.getBlockNumber(); // Get latest block number
            const latestBlock = await ethers.provider.getBlock(blockNumber);
            const latestTimestamp1 = latestBlock.timestamp;
            await time.increaseTo(latestTimestamp1 + 2592000);
            
            await BorrowingContractA.calculateCumulativeRate();
            await TokenA.mint(user2.getAddress(),80000000);
            await TokenA.connect(user2).approve(await BorrowingContractA.getAddress(),await TokenA.balanceOf(user2.getAddress()));

            await BorrowingContractA.connect(user2).withDraw(
                await user2.getAddress(), 
                1,
                99900,
                timeStamp,
                {value: nativeFee});
        })

        // it("Should depsoit in Kelp Dao and deposit WeETH in Borrow",async function(){
        //     const {
        //         BorrowingContractA,
        //         CDSContractA,
        //         usdtA,treasuryA
        //         ,globalVariablesA
        //     } = await loadFixture(deployer);
        //     // const timeStamp = await time.latest();
        //     const kepDaoContract = new ethers.Contract(kelpDaoDepositAddress, kelpDaoDepositABI,owner);
        //     // const eETHToken = new ethers.Contract(eETHTokenAddress, erc20ABI, owner);
        //     // const WeETHToken = new ethers.Contract(weETHAddressMainnet, WeETHABI, owner);

        //     // await usdtA.connect(user1).mint(user1.getAddress(),10000000000);
        //     // await usdtA.connect(user1).approve(CDSContractA.getAddress(),10000000000);
        //     // const options = Options.newOptions().addExecutorLzReceiveOption(350000, 0).toHex().toString()

        //     // let nativeFee = 0
        //     // ;[nativeFee] = await globalVariablesA.quote(1,1,options, false)
        //     // await CDSContractA.connect(user1).deposit(10000000000,0,true,10000000000, { value: nativeFee.toString()});
            
        //     const depositAmount = ethers.parseEther("1");
        //     console.log(await kepDaoContract.getRsETHAmountToMint('0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',depositAmount))
        //     // await BorrowingContractA.connect(owner).depositEthToKelpDao(kelpDaoDepositAddress,{value: depositAmount});

        // //     const share = await eETHToken.balanceOf(await owner.getAddress());
        // //     await eETHToken.approve(weETHAddressMainnet, share);

        // //     await WeETHToken.wrap(share);

        // //     await WeETHToken.approve(await BorrowingContractA.getAddress(), ethers.parseEther("0.5"));

        // //     await BorrowingContractA.connect(owner).depositTokens(
        // //         100000,
        // //         timeStamp,
        // //         [1,
        // //         110000,
        // //         ethVolatility,
        // //         1,
        // //         ethers.parseEther("0.5")],
        // //         {value: BigInt(nativeFee)})
        // })
    })

    describe("Should able to open position in Synthetix", function(){
        it("Should deposit in Liquid Vaults",async function(){
            const { BorrowingContractA } = await loadFixture(deployer);
            const eETHToken = new ethers.Contract(eETHTokenAddress, erc20ABI, owner);
            const WeETHToken = new ethers.Contract(weETHAddressMainnet, WeETHABI, owner);

            await BorrowingContractA.connect(user1).depositEthToEtherFi(etherFiDepositAddressMainnet,{value:ethers.parseEther('1')});

            // const eETHShare = await eETHToken.balanceOf(await user1.getAddress());
            // await eETHToken.connect(user1).approve('0xf0bb20865277aBd641a307eCe5Ee04E79073416C', eETHShare);

            // await WeETHToken.connect(user1).wrap(eETHShare);

            // const weETHShare = await WeETHToken.balanceOf(await user1.getAddress());
            // console.log(weETHShare);

            // await WeETHToken.connect(user1).transfer(await BorrowingContractA.getAddress(), weETHShare);

            // await BorrowingContractA.connect(user1).approveWeETH(weETHShare);

            // await WeETHToken.connect(user1).approve('0xf0bb20865277aBd641a307eCe5Ee04E79073416C', await WeETHToken.balanceOf(await user1.getAddress()));
            // await eETHToken.connect(user1).approve('0xf0bb20865277aBd641a307eCe5Ee04E79073416C', await eETHToken.balanceOf(await user1.getAddress()));
            // await BorrowingContractA.connect(user1).depositEthToEtherFiLiquidVaults('0x5c135e8eC99557b412b9B4492510dCfBD36066F5')
        });

        it.only("Should deposit in Liquid Vaults",async function(){
            const { Test } = await loadFixture(deployerTest);
            // const tx = await Test.connect(user1).getFillPrice();

            // await Test.getWETH({value:ethers.parseEther('0.1')});

            // await Test.swapWETHsETH(ethers.parseEther('0.1'));

            // await Test.swapSETHsUSD(ethers.parseEther('0.1'));

            // await Test.connect(user1).transferMargin();
            // await Test.connect(user1).openPositionInSynthetix();

            const connection1 = new EvmPriceServiceConnection("https://hermes.pyth.network");
            const connection2 = new PriceServiceConnection('https://hermes.pyth.network');
            const priceIds = [
                "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace", // ETH/USD price id
            ];

            // async function sleep(ms:number) {
            //     return new Promise((resolve) => setTimeout(resolve, ms));
            // }

            let priceUpdateData1 = await connection1.getPriceFeedsUpdateData(priceIds);
            // const priceUpdateData2 = await connection2.getLatestPriceFeeds(priceIds);
            console.log(priceUpdateData1);
            // console.log(priceUpdateData2);
            // // await sleep(15 * 1000);
            // const blockNumber = await ethers.provider.getBlockNumber(); // Get latest block number
            // const latestBlock = await ethers.provider.getBlock(blockNumber);
            // const latestTimestamp = latestBlock.timestamp;
            // console.log(latestTimestamp);
              
            // await Test.connect(user1).executeOrder(priceUpdateData1,{value:1});
            // await Test.cancelPosition();

            // const tx = await Test.getCurrentFundingRate();
            // console.log(tx);

        });
    })
})
