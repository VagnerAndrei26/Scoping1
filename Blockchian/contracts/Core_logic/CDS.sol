// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interface/IUSDa.sol";
import "../interface/IBorrowing.sol";
import "../interface/ITreasury.sol";
import "../interface/CDSInterface.sol";
import "../interface/IMultiSign.sol";
import "../interface/IGlobalVariables.sol";
import "../lib/CDSLib.sol";
import "hardhat/console.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import { OApp, MessagingFee, Origin } from "@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/OApp.sol";
import { MessagingReceipt } from "@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/OAppSender.sol";
import { OptionsBuilder } from "@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/libs/OptionsBuilder.sol";

contract CDS is CDSInterface,Initializable,UUPSUpgradeable,ReentrancyGuardUpgradeable,OwnableUpgradeable{

    IUSDa      public usda; // our stablecoin
    IBorrowing  private borrowing; // Borrowing contract interface
    ITreasury   private treasury; // Treasury contrcat interface
    AggregatorV3Interface private dataFeed;
    IMultiSign  private multiSign;// multisign instance
    IERC20      private usdt; // USDT interface

    address public admin; // admin address
    address private treasuryAddress; // treasury address
    address private borrowLiquidation; // borrow liquidation instance

    uint128 private lastEthPrice;// Last updated ETH price
    uint128 private fallbackEthPrice;// Second last ETH price
    uint64  public cdsCount; // cds depositors count
    uint64  private withdrawTimeLimit; // Fixed Time interval between deposit and withdraw
    uint256 public  totalCdsDepositedAmount; // total usda and usdt deposited in cds
    uint256 private totalCdsDepositedAmountWithOptionFees;
    uint256 public  totalAvailableLiquidationAmount; // total deposited usda available for liquidation
    uint128 private lastCumulativeRate; // last options fees cmulative rate
    uint8   public usdaLimit; // usda limit in percent
    uint64  public usdtLimit; // usdt limit in number
    uint256 public usdtAmountDepositedTillNow; // total usdt deposited till now
    uint256 private burnedUSDaInRedeem; // usda burned in redeem
    uint128 private cumulativeValue; // cumulative value
    bool    private cumulativeValueSign; // cumulative value sign whether its positive or not negative

    mapping (address => CdsDetails) public cdsDetails; // cds user deposit details

    // liquidations info based on liquidation numbers
    mapping (uint128 liquidationIndex => LiquidationInfo) private omniChainCDSLiqIndexToInfo; // liquidation info 

    using OptionsBuilder for bytes;
    // OmniChainCDSData private omniChainCDS;//! omnichainCDS contains global CDS data(all chains)
    // uint32 private dstEid;
    IGlobalVariables private globalVariables; // global variables instance

    /**
     * @dev initialize function to initialize the contract with initializer modifier
     * @param usdaAddress usda token address
     * @param priceFeedAddress chainlink pricefeed address
     * @param usdtAddress USDT address
     * @param multiSignAddress multi sign address
     */
    function initialize(
        address usdaAddress,
        address priceFeedAddress,
        address usdtAddress,
        address multiSignAddress
    ) initializer public{
        // Initialize the owner of the contract
        __Ownable_init(msg.sender);
        // Initialize the proxy contracts
        __UUPSUpgradeable_init();
        usda = IUSDa(usdaAddress); // usda token contract address
        usdt = IERC20(usdtAddress);
        multiSign = IMultiSign(multiSignAddress);
        dataFeed = AggregatorV3Interface(priceFeedAddress);
        lastEthPrice = getLatestData();
        fallbackEthPrice = lastEthPrice;
        cumulativeValueSign = true;
    }

    function _authorizeUpgrade(address implementation) internal onlyOwner override{}

    /**
     * @dev modifier to check whether the caller is an admin or not
     */
    modifier onlyAdmin(){
        require(msg.sender == admin,"Caller is not an admin");
        _;
    }
    /**
     * @dev modifier to check whether the caller is an globalVariables or borrowLiquidation or not
     */
    modifier onlyGlobalOrLiquidationContract() {
        require( msg.sender == address(globalVariables) || msg.sender == address(borrowLiquidation), "This function can only called by Global variables or Liquidation contract");
        _;
    }
    /**
     * @dev modifier to check whether the caller is an borrowing or not
     */
    modifier onlyBorrowingContract() {
        require( msg.sender == address(borrowing), "This function can only called by Borrowing contract");
        _;
    }
    /**
     * @dev modifier to check whether the fucntion is paused or not
     */
    modifier whenNotPaused(IMultiSign.Functions _function) {
        require(!multiSign.functionState(_function),'Paused');
        _;
    }

    /**
     * @dev get the eth price from chainlink 
     */
    function getLatestData() private view returns (uint128) {
        (
            /* uint80 roundID */,
            int answer,
            /*uint startedAt*/,
            /*uint timeStamp*/,
            /*uint80 answeredInRound*/
        ) = dataFeed.latestRoundData();
        uint temp = uint(answer);
        return uint128(temp/1e6);
    }

    /**
     * @dev update the last ETH price
     * @param priceAtEvent ETH price during event
     */
    function updateLastEthPrice(uint128 priceAtEvent) private {
        fallbackEthPrice = lastEthPrice;
        lastEthPrice = priceAtEvent;
    }
    /**
     * @dev Function to check if an address is a contract
     * @param account address to check whether the address is an contract address or EOA
     */
    function isContract(address account) private view returns (bool) {
        return account.code.length > 0;
    }

    /**
     * @dev set admin address
     * @param adminAddress  admin address
     */
    function setAdmin(address adminAddress) external onlyOwner{
        // Check whether the input address is not a zero address and contract
        require(adminAddress != address(0) && isContract(adminAddress) != true, "Admin can't be contract address & zero address");
        // Check whether, the function have required approvals from owners to set
        require(multiSign.executeSetterFunction(IMultiSign.SetterFunctions(4)));
        admin = adminAddress;    
    }

    /**
     * @dev deposit usda and usdt to cds
     * @param usdtAmount usdt amount to deposit
     * @param usdaAmount usda amount to deposit
     * @param liquidate whether the user opted for liquidation
     * @param liquidationAmount If opted for liquidation,the liquidation amount
     */
    function deposit(
        uint128 usdtAmount,
        uint128 usdaAmount,
        bool liquidate,
        uint128 liquidationAmount
    ) public payable nonReentrant whenNotPaused(IMultiSign.Functions(4)){
        // totalDepositingAmount is usdt and usda
        uint256 totalDepositingAmount = usdtAmount + usdaAmount;
        // Check the totalDepositingAmount is non zero
        require(totalDepositingAmount != 0, "Deposit amount should not be zero"); // check _amount not zero
        // Check the liquidationAmount is lesser than totalDepositingAmount
        require(
            liquidationAmount <= (totalDepositingAmount),
            "Liquidation amount can't greater than deposited amount"
        );
        // Get the global omnichain data
        IGlobalVariables.OmniChainData memory omniChainData = globalVariables.getOmniChainData();

        // Check whether the usdt limit is reached or not
        if(omniChainData.usdtAmountDepositedTillNow < usdtLimit){
            // If the usdtAmountDepositedTillNow and current depositing usdt amount is lesser or 
            // equal to usdtLimit
            if((omniChainData.usdtAmountDepositedTillNow + usdtAmount) <= usdtLimit){
                // Check the totalDepositingAmount is usdt amount 
                require(usdtAmount == totalDepositingAmount,'100% of amount must be USDT');
            }else{
                revert("Surplus USDT amount");
            }
        }else{
            // usda amount must be 80% of totalDepositingAmount
            require(usdaAmount >= (usdaLimit * totalDepositingAmount)/100,"Required USDa amount not met");
            // Check the user has enough usda
            require(usda.balanceOf(msg.sender) >= usdaAmount,"Insufficient USDa balance with msg.sender"); // check if user has sufficient USDa token
        }
        // Get eth price
        uint128 ethPrice = getLatestData();
        // Check the eth price is non zero
        require(ethPrice != 0,"Oracle Failed");
        uint64 index;

        // check if msg.sender is depositing for the first time
        // if yes change hasDeposited from desDeposit structure of msg.sender to true.
        // if not increase index of msg.sender in cdsDetails by 1.
        if (!cdsDetails[msg.sender].hasDeposited) {
            //change index value to 1
            index = cdsDetails[msg.sender].index = 1;

            //change hasDeposited to true
            cdsDetails[msg.sender].hasDeposited = true;
            //Increase cdsCount if msg.sender is depositing for the first time
            ++cdsCount;
            //! updating global data 
            ++omniChainData.cdsCount;
        }
        else {
            //increase index value by 1
            index = ++cdsDetails[msg.sender].index;
        }

        //add deposited amount of msg.sender of the perticular index in cdsAccountDetails
        cdsDetails[msg.sender].cdsAccountDetails[index].depositedAmount = totalDepositingAmount;

        //storing current ETH/USD rate
        cdsDetails[msg.sender].cdsAccountDetails[index].depositPrice = ethPrice;
        // Calculate the cumulatice value
        CalculateValueResult memory result = calculateValue(ethPrice);
        // Set the cumulative value
        setCumulativeValue(result.currentValue,result.gains);
        // Store the cumulative value and cumulative value sign
        cdsDetails[msg.sender].cdsAccountDetails[index].depositValue = cumulativeValue;
        cdsDetails[msg.sender].cdsAccountDetails[index].depositValueSign = cumulativeValueSign;

        //add deposited amount to totalCdsDepositedAmount
        totalCdsDepositedAmount += totalDepositingAmount;
        totalCdsDepositedAmountWithOptionFees += totalDepositingAmount;

        //! updating global data 
        omniChainData.totalCdsDepositedAmount += totalDepositingAmount;
        omniChainData.totalCdsDepositedAmountWithOptionFees += totalDepositingAmount;

        //increment usdtAmountDepositedTillNow
        usdtAmountDepositedTillNow += usdtAmount;

        //! updating global data 
        omniChainData.usdtAmountDepositedTillNow += usdtAmount;
        omniChainData.cdsPoolValue += totalDepositingAmount;
        
        //add deposited time of perticular index and amount in cdsAccountDetails
        cdsDetails[msg.sender].cdsAccountDetails[index].depositedTime = uint64(block.timestamp);
        cdsDetails[msg.sender].cdsAccountDetails[index].normalizedAmount = ((totalDepositingAmount * CDSLib.PRECISION)/omniChainData.lastCumulativeRate);
       
        // update the user data
        cdsDetails[msg.sender].cdsAccountDetails[index].optedLiquidation = liquidate;
        cdsDetails[msg.sender].cdsAccountDetails[index].lockingPeriod = 60;
        cdsDetails[msg.sender].cdsAccountDetails[index].depositedUSDa = usdaAmount;
        cdsDetails[msg.sender].cdsAccountDetails[index].depositedUSDT = usdtAmount;

        //If user opted for liquidation
        if(liquidate){
            cdsDetails[msg.sender].cdsAccountDetails[index].liquidationindex = omniChainData.noOfLiquidations;
            cdsDetails[msg.sender].cdsAccountDetails[index].liquidationAmount = liquidationAmount;
            cdsDetails[msg.sender].cdsAccountDetails[index].InitialLiquidationAmount = liquidationAmount;
            totalAvailableLiquidationAmount += liquidationAmount;
            
            //! updating global data 
            omniChainData.totalAvailableLiquidationAmount += liquidationAmount;
        }  

        if(ethPrice != lastEthPrice){
            updateLastEthPrice(ethPrice);
        }

        if(usdtAmount != 0 && usdaAmount != 0){
            require(usdt.balanceOf(msg.sender) >= usdtAmount,"Insufficient USDT balance with msg.sender"); // check if user has sufficient USDa token
            bool usdtTransfer = usdt.transferFrom(msg.sender, treasuryAddress, usdtAmount); // transfer amount to this contract
            require(usdtTransfer == true, "USDT Transfer failed in CDS deposit");
            //Transfer USDa tokens from msg.sender to this contract
            bool usdaTransfer = usda.transferFrom(msg.sender, treasuryAddress, usdaAmount); // transfer amount to this contract       
            require(usdaTransfer == true, "USDa Transfer failed in CDS deposit");
        }else if(usdtAmount == 0){
            bool transfer = usda.transferFrom(msg.sender, treasuryAddress, usdaAmount); // transfer amount to this contract
            //check it token have successfully transfer or not
            require(transfer == true, "USDa Transfer failed in CDS deposit");
        }else{
            require(usdt.balanceOf(msg.sender) >= usdtAmount,"Insufficient USDT balance with msg.sender"); // check if user has sufficient USDa token
            bool transfer = usdt.transferFrom(msg.sender, treasuryAddress, usdtAmount); // transfer amount to this contract
            //check it token have successfully transfer or not
            require(transfer == true, "USDT Transfer failed in CDS deposit");
        }

        // If the entered usda amount is eligible mint it
        if(usdtAmount != 0 ){
            bool success = usda.mint(treasuryAddress,usdtAmount);
            require(success == true, "USDa mint to treasury failed in CDS deposit");
        }

        //! getting options since,the src don't know the dst state
        bytes memory _options = OptionsBuilder.newOptions().addExecutorLzReceiveOption(350000, 0);

        //! calculting fee 
        MessagingFee memory fee = globalVariables.quote(IGlobalVariables.FunctionToDo(1), IBorrowing.AssetName(0), _options, false);

        globalVariables.setOmniChainData(omniChainData);
        //! Calling Omnichain send function
        globalVariables.send{value: fee.nativeFee}(IGlobalVariables.FunctionToDo(1), IBorrowing.AssetName(0), fee, _options,msg.sender);

        // emit Deposit event
        emit Deposit(msg.sender,index,usdaAmount,usdtAmount,block.timestamp,ethPrice,60,liquidationAmount,liquidate);
    }

    /**
     * @dev withdraw usda
     * @param index index of the deposit to withdraw
     */
    function withdraw(uint64 index) external payable nonReentrant whenNotPaused(IMultiSign.Functions(5)){

        // Check whether the entered index is present or not
        require(cdsDetails[msg.sender].index >= index , "user doesn't have the specified index");
        
        CdsAccountDetails memory cdsDepositDetails = cdsDetails[msg.sender].cdsAccountDetails[index];
        require(cdsDepositDetails.withdrawed == false,"Already withdrawn");
        
        // uint64 _withdrawTime = uint64(block.timestamp);
        
        // Check whether the withdraw time limit is reached or not
        require(cdsDepositDetails.depositedTime + withdrawTimeLimit <= uint64(block.timestamp),"cannot withdraw before the withdraw time limit");

        cdsDepositDetails.withdrawed = true;

        if (cdsDetails[msg.sender].index == 1 && index == 1) {
            --cdsCount;
        }

        // Get the exchange rate and eth price for all collaterals
        (uint128 weETH_ExchangeRate, uint128 ethPrice) = borrowing.getUSDValue(
            borrowing.assetAddress(IBorrowing.AssetName.WeETH));
        (uint128 rsETH_ExchangeRate, ) = borrowing.getUSDValue(
            borrowing.assetAddress(IBorrowing.AssetName.rsETH));

        require(ethPrice != 0,"Oracle Failed");
        // Get the global omnichain data
        IGlobalVariables.OmniChainData memory omniChainData = globalVariables.getOmniChainData();
        // Calculate return amount includes
        // eth Price difference gain or loss
        // option fees
        uint256 optionFees = ((cdsDepositDetails.normalizedAmount * omniChainData.lastCumulativeRate)/CDSLib.PRECISION) - 
            cdsDepositDetails.depositedAmount;
        uint256 returnAmount = cdsDepositDetails.depositedAmount + optionFees;
        // Calculate the options fees to get from other chains
        uint256 optionsFeesToGetFromOtherChain = getOptionsFeesProportions(optionFees);

        // Update user deposit data
        cdsDepositDetails.withdrawedAmount = returnAmount;
        cdsDepositDetails.withdrawedTime =  uint64(block.timestamp);
        cdsDepositDetails.ethPriceAtWithdraw = ethPrice;

        //! getting options since,the src don't know the dst state
        bytes memory _options = OptionsBuilder.newOptions().addExecutorLzReceiveOption(350000, 0);

        //! calculting fee 
        MessagingFee memory fee = globalVariables.quote(
            IGlobalVariables.FunctionToDo(2),
            IBorrowing.AssetName(0),
            _options, 
            false);
        uint128 usdaToTransfer;
        uint128 ethAmount;

        // If user opted for liquidation
        if(cdsDepositDetails.optedLiquidation){
            (
                cdsDepositDetails,
                omniChainData,
                ethAmount,
                usdaToTransfer,
                optionFees
            ) = withdrawUserWhoOptedForLiqGains(WithdrawUserWhoOptedForLiqGainsParams(
                cdsDepositDetails,
                omniChainData,
                optionFees,
                optionsFeesToGetFromOtherChain,
                returnAmount,
                ethAmount,
                usdaToTransfer,
                weETH_ExchangeRate,
                rsETH_ExchangeRate,
                fee.nativeFee
            ));
        }else{
            (
                cdsDepositDetails,
                omniChainData,
                ethAmount,
                usdaToTransfer,
                optionFees
            ) = withdrawUserWhoNotOptedForLiqGains(WithdrawUserWhoNotOptedForLiqGainsParams(
                cdsDepositDetails,
                omniChainData,
                optionFees,
                optionsFeesToGetFromOtherChain,
                returnAmount,
                usdaToTransfer,
                fee.nativeFee
            ));
        }
        omniChainData.cdsPoolValue -= cdsDepositDetails.depositedAmount;
        // Update the user deposit data
        cdsDetails[msg.sender].cdsAccountDetails[index] = cdsDepositDetails;
        // Update the global omnichain struct
        globalVariables.setOmniChainData(omniChainData);
        // Check whether after withdraw cds have enough funds to protect borrower's collateral
        if(omniChainData.totalVolumeOfBorrowersAmountinWei != 0){
            require(borrowing.calculateRatio(0,100000) > (2 * CDSLib.RATIO_PRECISION),"CDS: Not enough fund in CDS");
        }

        if(ethPrice != lastEthPrice){
            updateLastEthPrice(ethPrice);
        }
        // if both optionsFeesToGetFromOtherChain & ethAmount
        // are zero return the gas fee
        if(optionsFeesToGetFromOtherChain == 0 && ethAmount == 0){
            (bool sent,) = payable(msg.sender).call{value: msg.value - fee.nativeFee}("");
            require(sent, "Failed to send Ether");
        }

        //! Calling Omnichain send function
        globalVariables.send{value: fee.nativeFee}(IGlobalVariables.FunctionToDo(2), IBorrowing.AssetName(0), fee, _options,msg.sender);
        
        emit Withdraw(msg.sender,index,usdaToTransfer,block.timestamp,ethAmount,ethPrice,optionFees,optionFees);
    }


    /**
     * @dev calculating Ethereum value to return to CDS owner
     * The function will deduct some amount of ether if it is borrowed
     * Deduced amount will be calculated using the percentage of CDS a user owns
     * @param _user CDS user address
     * @param index Index of the position
     * @param _ethPrice ETH price
     */
    function cdsAmountToReturn(
        address _user,
        uint64 index,
        uint128 _ethPrice
    ) private returns(uint256){

        // Calculate current value
        CalculateValueResult memory result = calculateValue(_ethPrice);
        // Set the cumulative vaue
        setCumulativeValue(result.currentValue,result.gains);
        uint256 depositedAmount = cdsDetails[_user].cdsAccountDetails[index].depositedAmount;
        uint128 cumulativeValueAtDeposit = cdsDetails[msg.sender].cdsAccountDetails[index].depositValue;
        // Get the cumulative value sign at the time of deposit
        bool cumulativeValueSignAtDeposit = cdsDetails[msg.sender].cdsAccountDetails[index].depositValueSign;
        uint128 valDiff;
        uint128 cumulativeValueAtWithdraw = cumulativeValue;

        // If the depositVal and cumulativeValue both are in same sign
        if(cumulativeValueSignAtDeposit == cumulativeValueSign){
            // Calculate the value difference
            if(cumulativeValueAtDeposit > cumulativeValueAtWithdraw){
                valDiff = cumulativeValueAtDeposit - cumulativeValueAtWithdraw;
            }else{
                valDiff = cumulativeValueAtWithdraw - cumulativeValueAtDeposit;
            }
            // If cumulative value sign at the time of deposit is positive
            if(cumulativeValueSignAtDeposit){
                if(cumulativeValueAtDeposit > cumulativeValueAtWithdraw){
                    // Its loss since cumulative val is low
                    uint256 loss = (depositedAmount * valDiff) / 1e11;
                    return (depositedAmount - loss);
                }else{
                    // Its gain since cumulative val is high
                    uint256 profit = (depositedAmount * valDiff)/1e11;
                    return (depositedAmount + profit);
                }
            }else{
                if(cumulativeValueAtDeposit > cumulativeValueAtWithdraw){
                     // Its gain since cumulative val is high
                    uint256 profit = (depositedAmount * valDiff)/1e11;
                    return (depositedAmount + profit);
                }else{
                    // Its loss since cumulative val is low
                    uint256 loss = (depositedAmount * valDiff) / 1e11;
                    return (depositedAmount - loss);
                }
            }
        }else{
            valDiff = cumulativeValueAtDeposit + cumulativeValueAtWithdraw;
            if(cumulativeValueSignAtDeposit){
                // Its loss since cumulative val at deposit is positive
                uint256 loss = (depositedAmount * valDiff) / 1e11;
                return (depositedAmount - loss);
            }else{
                // Its loss since cumulative val at deposit is negative
                uint256 profit = (depositedAmount * valDiff)/1e11;
                return (depositedAmount + profit);            
            }
        }
   }

    /**
     * @dev acts as dex usda to usdt
     * @param usdaAmount usda amount to deposit
     * @param usdaPrice usda price
     * @param usdtPrice usdt price
     */
    function redeemUSDT(
        uint128 usdaAmount,
        uint64 usdaPrice,
        uint64 usdtPrice
    ) external payable nonReentrant whenNotPaused(IMultiSign.Functions(6)){
        // CHeck the usdaAmount is non zero
        require(usdaAmount != 0,"Amount should not be zero");
        // Check the user has enough usda balance
        require(usda.balanceOf(msg.sender) >= usdaAmount,"Insufficient balance");
        // Increment burnedUSDaInRedeem
        burnedUSDaInRedeem += usdaAmount;
        // GET the omnichain data
        IGlobalVariables.OmniChainData memory omniChainData = globalVariables.getOmniChainData();
        // Increment burnedUSDaInRedeem
        omniChainData.burnedUSDaInRedeem += usdaAmount;
        // burn usda
        bool transfer = usda.burnFromUser(msg.sender,usdaAmount);
        require(transfer == true, "USDa Burn failed in redeemUSDT");
        // calculate the USDT USDa ratio
        uint128 usdtAmount = (usdaPrice * usdaAmount/usdtPrice);  
          
        treasury.approveTokens(IBorrowing.AssetName.TUSDT, address(this),usdtAmount);
        // Transfer usdt to treasury
        bool success = usdt.transferFrom(treasuryAddress,msg.sender,usdtAmount);
        require(success == true, "USDT Transfer failed in redeemUSDT");

        //! getting options since,the src don't know the dst state
        bytes memory _options = OptionsBuilder.newOptions().addExecutorLzReceiveOption(350000, 0);

        //! calculting fee 
        MessagingFee memory fee = globalVariables.quote(
            IGlobalVariables.FunctionToDo(1),
            IBorrowing.AssetName(0),
            _options, 
            false);

        globalVariables.setOmniChainData(omniChainData);
        //! Calling Omnichain send function
        globalVariables.send{value: fee.nativeFee}(IGlobalVariables.FunctionToDo(1), IBorrowing.AssetName(0), fee, _options,msg.sender);
    }
    /**
     * @dev set the withdraw time limit
     * @param _timeLimit timelimit in seconds
     */
    function setWithdrawTimeLimit(uint64 _timeLimit) external onlyAdmin {
        // Check he timelimit is non zero
        require(_timeLimit != 0, "Withdraw time limit can't be zero");
        // Check whether, the function have required approvals from owners to set
        require(multiSign.executeSetterFunction(IMultiSign.SetterFunctions(2)));
        withdrawTimeLimit = _timeLimit;
    }
    /**
     * @dev set the borrowing contract
     * @param _address Borrowing contract address
     */
    function setBorrowingContract(address _address) external onlyAdmin {
        // Check whether the input address is not a zero address and EOA
        require(_address != address(0) && isContract(_address) != false, "Input address is invalid");
        borrowing = IBorrowing(_address);
    }
    /**
     * @dev set the treasury contract
     * @param _treasury Treasuty contract address
     */
    function setTreasury(address _treasury) external onlyAdmin{
        // Check whether the input address is not a zero address and EOA
        require(_treasury != address(0) && isContract(_treasury) != false, "Input address is invalid");
        // Check whether, the function have required approvals from owners to set
        require(multiSign.executeSetterFunction(IMultiSign.SetterFunctions(6)));
        treasuryAddress = _treasury;
        treasury = ITreasury(_treasury);
    }
    /**
     * @dev set the borrow liquidation address
     * @param _address Borrow Liquidation address
     */
    function setBorrowLiquidation(address _address) external onlyAdmin {
        // Check whether the input address is not a zero address and EOA
        require(_address != address(0) && isContract(_address) != false, "Input address is invalid");
        borrowLiquidation = _address;
    }
    /**
     * @dev set the global variables contract
     * @param _address Global variables address
     */
    function setGlobalVariables(address _address) external onlyAdmin {
        // Check whether the input address is not a zero address and EOA
        require(_address != address(0) && isContract(_address) != false, "Input address is invalid");
        globalVariables = IGlobalVariables(_address);
        // GEt the omnichain data
        IGlobalVariables.OmniChainData memory omniChainData = globalVariables.getOmniChainData();
        omniChainData.lastCumulativeRate = CDSLib.PRECISION;
        globalVariables.setOmniChainData(omniChainData);
    }
    /**
     * @dev set usda limit in deposit
     * @param percent USDa deposit limit in percentage
     */
    function setUSDaLimit(uint8 percent) external onlyAdmin{
        // Checkt the percent is non zero
        require(percent != 0, "USDa limit can't be zero");
        // Check whether, the function have required approvals from owners to set
        require(multiSign.executeSetterFunction(IMultiSign.SetterFunctions(8)));
        usdaLimit = percent;  
    }
    /**
     * @dev set usdt time limit in deposit
     * @param amount USDT amount in wei
     */
    function setUsdtLimit(uint64 amount) external onlyAdmin{
        // Check the amount is non zero
        require(amount != 0, "USDT limit can't be zero");
        // Check whether, the function have required approvals from owners to set
        require(multiSign.executeSetterFunction(IMultiSign.SetterFunctions(9)));
        usdtLimit = amount;  
    }
    /**
     * @dev calculate the cumulative value
     * @param _price ETH price
     */
    function calculateValue(uint128 _price) private view returns(CalculateValueResult memory) {
        // Get tha omnichain data
        IGlobalVariables.OmniChainData memory omniChainData = globalVariables.getOmniChainData();

        uint256 vaultBal = omniChainData.totalVolumeOfBorrowersAmountinWei;
        // Call calculate value in cds library
        return CDSLib.calculateValue(
            _price,
            totalCdsDepositedAmount,
            lastEthPrice,
            fallbackEthPrice,
            vaultBal
        );
    }

    /**
     * @dev calculate cumulative rate
     * @param fees fees to split
     */
    function calculateCumulativeRate(uint128 fees) external onlyBorrowingContract returns(uint128){
        // get omnichain data
        IGlobalVariables.OmniChainData memory omniChainData = globalVariables.getOmniChainData();
        // call calculate cumulative rate in cds library
        (
            totalCdsDepositedAmountWithOptionFees,
            omniChainData.totalCdsDepositedAmountWithOptionFees,
            omniChainData.lastCumulativeRate) = CDSLib.calculateCumulativeRate(
            fees,
            totalCdsDepositedAmount,
            totalCdsDepositedAmountWithOptionFees,
            omniChainData.totalCdsDepositedAmountWithOptionFees,
            omniChainData.lastCumulativeRate,
            omniChainData.noOfBorrowers
        );

        return omniChainData.lastCumulativeRate;
    }

    /**
     * @param value cumulative value to add or subtract
     * @param gains if true,add value else subtract 
     */
    function setCumulativeValue(uint128 value,bool gains) private{
        // call set cumulative value in cds library
        (cumulativeValueSign, cumulativeValue) = CDSLib.setCumulativeValue(
            value,
            gains,
            cumulativeValueSign,
            cumulativeValue
        );
    }
    /**
     * @dev get the options fees to get from  other chains
     * @param optionsFees Total Options fees
     */
    function getOptionsFeesProportions(uint256 optionsFees) private view returns (uint256){
        // GEt the omnichain data
        IGlobalVariables.OmniChainData memory omniChainData = globalVariables.getOmniChainData();
        // Call getOptionsFeesProportions in cds library
        return CDSLib.getOptionsFeesProportions(
            optionsFees,
            totalCdsDepositedAmount,
            omniChainData.totalCdsDepositedAmount,
            totalCdsDepositedAmountWithOptionFees,
            omniChainData.totalCdsDepositedAmountWithOptionFees
        );
    }
    /**
     * @dev returns the yields gained by user
     * @param user CDS user address
     * @param index Deposited index
     */
    function calculateLiquidatedETHTogiveToUser(address user, uint64 index) external view returns(uint256,uint256,uint128,uint256){
        CDSInterface.CdsAccountDetails memory cdsDepositData = cdsDetails[user].cdsAccountDetails[index];
        IGlobalVariables.OmniChainData memory omniChainData = globalVariables.getOmniChainData();
        uint256 ethAmount;
        uint128 profit;
        uint256 priceChangePL = CDSLib.cdsAmountToReturn(
            cdsDepositData,
            calculateValue(uint128(getLatestData())),
            cumulativeValue,
            cumulativeValueSign
        );

        uint256 returnAmount = (cdsDepositData.normalizedAmount * omniChainData.lastCumulativeRate)/CDSLib.PRECISION;
        if(cdsDepositData.optedLiquidation){
            returnAmount -= cdsDepositData.liquidationAmount;
            uint128 currentLiquidations = omniChainData.noOfLiquidations;
            uint128 liquidationIndexAtDeposit = cdsDepositData.liquidationindex;
            if(currentLiquidations >= liquidationIndexAtDeposit){
                // Loop through the liquidations that were done after user enters
                for(uint128 i = (liquidationIndexAtDeposit + 1); i <= currentLiquidations; i++){
                    uint128 liquidationAmount = cdsDepositData.liquidationAmount;
                    if(liquidationAmount > 0){
                        CDSInterface.LiquidationInfo memory liquidationData = omniChainCDSLiqIndexToInfo[i];

                        uint128 share = (liquidationAmount * 1e10)/uint128(liquidationData.availableLiquidationAmount);

                        profit += (liquidationData.profits * share)/1e10;
                        cdsDepositData.liquidationAmount -= ((liquidationData.liquidationAmount*share)/1e10);
                        ethAmount += (liquidationData.collateralAmount * share)/1e10;
                    }
                }
            }
            returnAmount += cdsDepositData.liquidationAmount;
        }
        return (returnAmount,priceChangePL,profit,ethAmount);
    }
    /**
     * @dev update the liquidation info
     * @param index Liquidation index
     * @param liquidationData struct, contains liquidation details
     */
    function updateLiquidationInfo(uint128 index,LiquidationInfo memory liquidationData) external onlyGlobalOrLiquidationContract{
        omniChainCDSLiqIndexToInfo[index] = liquidationData;
    }
    /**
     * @dev update Total Available Liquidation Amount
     * @param amount Liquiation amount used for liquidation
     */
    function updateTotalAvailableLiquidationAmount(uint256 amount) external onlyGlobalOrLiquidationContract{
        // If the totalAvailableLiquidationAmount is non zero
        if(totalAvailableLiquidationAmount != 0){
            totalAvailableLiquidationAmount -= amount;
        }
    }
    /**
     * @dev update the total cds deposited amount
     * @param _amount Liquiation amount used for liquidation
     */
    function updateTotalCdsDepositedAmount(uint128 _amount) external onlyGlobalOrLiquidationContract{
        // If the totalCdsDepositedAmount is non zero
        if(totalCdsDepositedAmount != 0){
            totalCdsDepositedAmount -= _amount;
        }
    }
    /**
     * @dev update the total cds deposited amount with options fees
     * @param _amount Liquiation amount used for liquidation
     */
    function updateTotalCdsDepositedAmountWithOptionFees(uint128 _amount) external onlyGlobalOrLiquidationContract{
        // If the totalCdsDepositedAmountWithOptionFees is non zero
        if(totalCdsDepositedAmountWithOptionFees != 0){
            totalCdsDepositedAmountWithOptionFees -= _amount;
        }
    }
    /**
     * @dev Get the cds deposit details
     * @param depositor cds user address
     * @param index index of the deposit to get details
     */
    function getCDSDepositDetails(address depositor,uint64 index) external view returns(CdsAccountDetails memory,uint64){
        return (cdsDetails[depositor].cdsAccountDetails[index],cdsDetails[depositor].index);
    }

    /**
     * @dev Withdraw CDS user positions, who opted for liquidation
     * @param params Struct, contains params required for withdraw
     */
    function withdrawUserWhoOptedForLiqGains(
        WithdrawUserWhoOptedForLiqGainsParams memory params
    ) internal returns(CdsAccountDetails memory, IGlobalVariables.OmniChainData memory, uint128, uint128, uint256) {
        uint128 weETHAmount;
        uint128 rsETHAmount;
        uint128 weETHAmountInETHValue;
        uint128 rsETHAmountInETHValue;
        uint128 collateralToGetFromOtherChain;
        uint128 totalWithdrawCollateralAmountInETH;
        params.returnAmount -= params.cdsDepositDetails.liquidationAmount;
        // uint128 currentLiquidations = omniChainData.noOfLiquidations;
        uint128 liquidationIndexAtDeposit = params.cdsDepositDetails.liquidationindex;
        // If the number of liquidations is greater than or equal to liquidationIndexAtDeposit 
        if(params.omniChainData.noOfLiquidations >= liquidationIndexAtDeposit){
            // Loop through the liquidations that were done after user enters
            for(uint128 i = (liquidationIndexAtDeposit + 1); i <= params.omniChainData.noOfLiquidations; i++){
                uint128 liquidationAmount = params.cdsDepositDetails.liquidationAmount;
                // If the user available liquidation is non zero
                if(liquidationAmount > 0){
                    LiquidationInfo memory liquidationData = omniChainCDSLiqIndexToInfo[i];

                    // Calculate the share by taking ratio between
                    // User's available liquidation amount and total available liquidation amount
                    uint128 share = (liquidationAmount * 1e10)/uint128(liquidationData.availableLiquidationAmount);
                    // Update users available liquidation amount
                    params.cdsDepositDetails.liquidationAmount -= CDSLib.getUserShare(liquidationData.liquidationAmount,share);
                    // Based on the collateral type calculate the liquidated collateral to give to user
                    if(liquidationData.assetName == IBorrowing.AssetName.ETH){
                        // increment eth amount
                        params.ethAmount += CDSLib.getUserShare(liquidationData.collateralAmount, share);
                    }else if(liquidationData.assetName == IBorrowing.AssetName.WeETH){
                        // increment weeth amount and weth amount value
                        weETHAmount += CDSLib.getUserShare(liquidationData.collateralAmount, share);
                        weETHAmountInETHValue += CDSLib.getUserShare(liquidationData.collateralAmountInETHValue, share);
                    }else if(liquidationData.assetName == IBorrowing.AssetName.rsETH){
                        // increment rseth amount and rseth amount value
                        rsETHAmount += CDSLib.getUserShare(liquidationData.collateralAmount, share);
                        rsETHAmountInETHValue += CDSLib.getUserShare(liquidationData.collateralAmountInETHValue, share);
                    }
                }
            }

            uint256 returnAmountWithGains = params.returnAmount + params.cdsDepositDetails.liquidationAmount;
            // Calculate the yields which is accured between liquidation and now
            treasury.updateYieldsFromLiquidatedLrts(
                weETHAmount - ((weETHAmountInETHValue * 1 ether)/ params.weETH_ExchangeRate) + 
                rsETHAmount - ((rsETHAmountInETHValue * 1 ether)/ params.rsETH_ExchangeRate));

            // Calculate the weeth and rseth amount without yields
            weETHAmount = weETHAmount - (weETHAmount - (
                (weETHAmountInETHValue * 1 ether)/ params.weETH_ExchangeRate));
            rsETHAmount = rsETHAmount - (rsETHAmount - (
                (rsETHAmountInETHValue * 1 ether)/ params.rsETH_ExchangeRate));

            // call getLiquidatedCollateralToGive in cds library to get in which assests to give liquidated collateral
            (   
                totalWithdrawCollateralAmountInETH,
                params.ethAmount,
                weETHAmount,
                rsETHAmount,
                collateralToGetFromOtherChain
            ) = CDSLib.getLiquidatedCollateralToGive(
                    GetLiquidatedCollateralToGiveParam(
                        params.ethAmount,
                        weETHAmount,
                        rsETHAmount,
                        treasury.liquidatedCollateralAmountInWei(IBorrowing.AssetName.ETH),
                        treasury.liquidatedCollateralAmountInWei(IBorrowing.AssetName.WeETH),
                        treasury.liquidatedCollateralAmountInWei(IBorrowing.AssetName.rsETH),
                        treasury.totalVolumeOfBorrowersAmountLiquidatedInWei(),
                        params.weETH_ExchangeRate,
                        params.rsETH_ExchangeRate
                    )
                );

            // Update the totalCdsDepositedAmount based on collateral amounts
            if(params.ethAmount == 0 && weETHAmount == 0 && rsETHAmount == 0 && collateralToGetFromOtherChain == 0){
                // update totalCdsDepositedAmount
                totalCdsDepositedAmount -= params.cdsDepositDetails.depositedAmount;
                params.omniChainData.totalCdsDepositedAmount -= params.cdsDepositDetails.depositedAmount;
                // update totalCdsDepositedAmountWithOptionFees
                totalCdsDepositedAmountWithOptionFees -= (
                    params.cdsDepositDetails.depositedAmount + (params.optionFees - params.optionsFeesToGetFromOtherChain));
                params.omniChainData.totalCdsDepositedAmountWithOptionFees -= (
                    params.cdsDepositDetails.depositedAmount + params.optionFees);
            }else{
                // update totalCdsDepositedAmount
                totalCdsDepositedAmount -= (params.cdsDepositDetails.depositedAmount - params.cdsDepositDetails.liquidationAmount);
                params.omniChainData.totalCdsDepositedAmount -= (
                    params.cdsDepositDetails.depositedAmount 
                    - params.cdsDepositDetails.liquidationAmount);
                // update totalCdsDepositedAmountWithOptionFees
                totalCdsDepositedAmountWithOptionFees -= (
                    params.cdsDepositDetails.depositedAmount - params.cdsDepositDetails.liquidationAmount + params.optionsFeesToGetFromOtherChain);
                params.omniChainData.totalCdsDepositedAmountWithOptionFees -= (
                    params.cdsDepositDetails.depositedAmount - params.cdsDepositDetails.liquidationAmount + params.optionFees);
            }
        
            // if any one of the optionsFeesToGetFromOtherChain & ethAmount
            // are positive get it from other chains 
            if(params.optionsFeesToGetFromOtherChain > 0 || collateralToGetFromOtherChain > 0 ){
                uint128 ethAmountFromOtherChain;
                uint128 weETHAmountFromOtherChain;
                uint128 rsETHAmountFromOtherChain;

                // If needs to get the liquidated collateral from other chain
                if(collateralToGetFromOtherChain != 0){
                    // again call getLiquidatedCollateralToGive in cds library
                    (   
                        ,
                        ethAmountFromOtherChain,
                        weETHAmountFromOtherChain,
                        rsETHAmountFromOtherChain,
                    ) = CDSLib.getLiquidatedCollateralToGive(
                            GetLiquidatedCollateralToGiveParam(
                                collateralToGetFromOtherChain,
                                0,
                                0,
                                globalVariables.getOmniChainCollateralData(IBorrowing.AssetName.ETH).totalLiquidatedAmount - 
                                treasury.liquidatedCollateralAmountInWei(IBorrowing.AssetName.ETH),
                                globalVariables.getOmniChainCollateralData(IBorrowing.AssetName.WeETH).totalLiquidatedAmount - 
                                treasury.liquidatedCollateralAmountInWei(IBorrowing.AssetName.WeETH),
                                globalVariables.getOmniChainCollateralData(IBorrowing.AssetName.rsETH).totalLiquidatedAmount - 
                                treasury.liquidatedCollateralAmountInWei(IBorrowing.AssetName.rsETH),
                                params.omniChainData.totalVolumeOfBorrowersAmountLiquidatedInWei - treasury.totalVolumeOfBorrowersAmountLiquidatedInWei(),
                                params.weETH_ExchangeRate,
                                params.rsETH_ExchangeRate
                            )
                        );

                    params.ethAmount = ethAmountFromOtherChain + params.ethAmount;
                    weETHAmount = weETHAmountFromOtherChain + weETHAmount;
                    rsETHAmount = rsETHAmountFromOtherChain + rsETHAmount;
                }
                // Get the assets from other chain
                globalVariables.oftOrCollateralReceiveFromOtherChains{ value: msg.value - params.fee}(
                    IGlobalVariables.FunctionToDo(
                        // Call getLzFunctionToDo in cds library to get, which action needs to do in dst chain
                        CDSLib.getLzFunctionToDo(params.optionsFeesToGetFromOtherChain,collateralToGetFromOtherChain)
                    ),
                    IGlobalVariables.USDaOftTransferData(treasuryAddress, params.optionsFeesToGetFromOtherChain),
                    IGlobalVariables.CollateralTokenTransferData(
                        treasuryAddress, 
                        ethAmountFromOtherChain,
                        weETHAmountFromOtherChain,
                        rsETHAmountFromOtherChain),
                    msg.sender);
            }
            //Calculate the usda amount to give to user after deducting 10% from the above final amount
            params.usdaToTransfer = CDSLib.calculateUserProportionInWithdraw(
                params.cdsDepositDetails.depositedAmount,
                returnAmountWithGains 
            );
            //Update the treasury data
            treasury.updateUsdaCollectedFromCdsWithdraw(returnAmountWithGains - params.usdaToTransfer);
            treasury.updateLiquidatedETHCollectedFromCdsWithdraw(params.ethAmount);
            // Update deposit data
            params.cdsDepositDetails.withdrawedAmount = params.usdaToTransfer;
            params.cdsDepositDetails.withdrawCollateralAmount = totalWithdrawCollateralAmountInETH;
            params.cdsDepositDetails.optionFees = params.optionFees;
            params.cdsDepositDetails.optionFeesWithdrawn = params.optionFees;
            // Get approval from treasury 
            treasury.approveTokens(IBorrowing.AssetName.USDa, address(this),params.usdaToTransfer);

            //Call transferFrom in usda
            bool success = usda.transferFrom(treasuryAddress,msg.sender, params.usdaToTransfer); // transfer amount to msg.sender
            require(success == true, "Transsuccessed in cds withdraw");
            
            if(params.ethAmount != 0){
                params.omniChainData.collateralProfitsOfLiquidators -= totalWithdrawCollateralAmountInETH;
                // treasury.updateEthProfitsOfLiquidators(ethAmount,false);
                // Call transferEthToCdsLiquidators to tranfer eth
                treasury.transferEthToCdsLiquidators(msg.sender,params.ethAmount);
            }
            if(weETHAmount != 0 ){
                treasury.approveTokens(IBorrowing.AssetName.WeETH, address(this),weETHAmount);
                bool sent = IERC20(borrowing.assetAddress(IBorrowing.AssetName.WeETH)).transferFrom(
                treasuryAddress,msg.sender, weETHAmount); // transfer amount to msg.sender
                require(sent == true, "Transsuccessed in cds withdraw");
            }
            if(rsETHAmount != 0 ){
                treasury.approveTokens(IBorrowing.AssetName.rsETH, address(this),rsETHAmount);
                bool sent = IERC20(borrowing.assetAddress(IBorrowing.AssetName.rsETH)).transferFrom(
                treasuryAddress,msg.sender, rsETHAmount); // transfer amount to msg.sender
                require(sent == true, "Transsuccessed in cds withdraw");
            }
        }

        return(params.cdsDepositDetails, params.omniChainData, params.ethAmount, params.usdaToTransfer, params.optionFees);
    }

    /**
     * @dev Withdraw CDS user positions, who not opted for liquidation
     * @param params Struct, contains params required for withdraw
     */
    function withdrawUserWhoNotOptedForLiqGains(
        WithdrawUserWhoNotOptedForLiqGainsParams memory params
    ) internal returns(CdsAccountDetails memory, IGlobalVariables.OmniChainData memory, uint128, uint128, uint256) {
        // if the optionsFeesToGetFromOtherChain
        // is positive get it from other chains 
        if(params.optionsFeesToGetFromOtherChain > 0){
            globalVariables.oftOrCollateralReceiveFromOtherChains{ value: msg.value - params.fee}(
                IGlobalVariables.FunctionToDo(3),
                IGlobalVariables.USDaOftTransferData(treasuryAddress, params.optionsFeesToGetFromOtherChain),
                IGlobalVariables.CollateralTokenTransferData(address(0), 0, 0, 0),
                msg.sender);
        }

        // update totalCdsDepositedAmount and totalCdsDepositedAmountWithOptionFees
        totalCdsDepositedAmount -= params.cdsDepositDetails.depositedAmount;
        totalCdsDepositedAmountWithOptionFees -= params.returnAmount - params.optionsFeesToGetFromOtherChain;

        params.omniChainData.totalCdsDepositedAmount -= params.cdsDepositDetails.depositedAmount;
        params.omniChainData.totalCdsDepositedAmountWithOptionFees -= params.returnAmount;

        // Call calculateUserProportionInWithdraw in cds library to get usda to transfer to user
        params.usdaToTransfer = CDSLib.calculateUserProportionInWithdraw(
            params.cdsDepositDetails.depositedAmount,
            params.returnAmount 
            );
        
        // Update user deposit details
        params.cdsDepositDetails.withdrawedAmount = params.usdaToTransfer;
        params.cdsDepositDetails.optionFees = params.optionFees;
        params.cdsDepositDetails.optionFeesWithdrawn = params.optionFees;

        treasury.approveTokens(IBorrowing.AssetName.USDa, address(this), params.usdaToTransfer);
        bool transfer = usda.transferFrom(treasuryAddress,msg.sender, params.usdaToTransfer); // transfer amount to msg.sender
        // Check the transfer is successfull or not
        require(transfer == true, "Transfer failed in cds withdraw");
        return(params.cdsDepositDetails, params.omniChainData, 0, params.usdaToTransfer, params.optionFees);
    }
}