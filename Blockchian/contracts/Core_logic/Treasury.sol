// SPDX-License-Identifier: unlicensed

pragma solidity 0.8.20;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/interfaces/IERC20.sol";
import "../interface/IUSDa.sol";
import { State,IABONDToken } from "../interface/IAbond.sol";
import "../interface/IBorrowing.sol";
import "../interface/ITreasury.sol";
import "../interface/IGlobalVariables.sol";
import "../interface/AaveInterfaces/IWETHGateway.sol";
import "../interface/AaveInterfaces/IPoolAddressesProvider.sol";
import "../interface/CometMainInterface.sol";
import "../interface/IWETH9.sol";
import "../lib/TreasuryLib.sol";
import "hardhat/console.sol";
import { OApp, MessagingFee, Origin } from "@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/OApp.sol";
import { MessagingReceipt } from "@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/OAppSender.sol";
import { OptionsBuilder } from "@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/libs/OptionsBuilder.sol";

contract Treasury is ITreasury,Initializable,UUPSUpgradeable,ReentrancyGuardUpgradeable,OwnableUpgradeable {

    IBorrowing  private borrow; // Borrowing instance
    IUSDa      public usda; // USDa instance
    IABONDToken private abond; // ABOND instance
    IWrappedTokenGatewayV3  private wethGateway; // Weth gateway is used to deposit eth in  and withdraw from aave
    IPoolAddressesProvider  private aavePoolAddressProvider; // To get the current pool  address in Aave
    IERC20  private usdt;// USDT instance
    IERC20  private aToken; // aave token contract
    CometMainInterface private comet; // To deposit in and withdraw eth from compound
    IWETH9 private WETH; // WETH instance

    address private cdsContract;// cds contract address
    address private borrowLiquidation;// borrow liquiation contract address
    address private compoundAddress;// compound address

    // Get depositor details by address
    mapping(address depositor => BorrowerDetails) public borrowing;// borrower details mapping
    //Get external protocol deposit details by protocol name (enum)
    mapping(Protocol => ProtocolDeposit) private protocolDeposit;// external protocol details mapping
    uint256 public totalVolumeOfBorrowersAmountinWei; // Total collateral depsoited in ETH
    //eth vault value
    uint256 public totalVolumeOfBorrowersAmountinUSD; // Total collateral deposited in USD 
    uint128 public noOfBorrowers;// No of borrowers in this chain
    uint256 private totalInterest;// total interest gained from lending
    uint256 private totalInterestFromLiquidation;
    uint256 public abondUSDaPool;// usda abond pool value
    uint256 private collateralProfitsOfLiquidators;// Liquidated collaterals for cds users
    uint256 private interestFromExternalProtocolDuringLiquidation;// interest from ext protocol till liquidation

    uint128 private PRECISION;
    uint256 private CUMULATIVE_PRECISION;

    uint256 public usdaGainedFromLiquidation;// USDa gained during liquidation
    using OptionsBuilder for bytes;
    uint256 private usdaCollectedFromCdsWithdraw; // 10% deducted usda from cds users during withdraw
    uint256 private liquidatedCollateralCollectedFromCdsWithdraw;
    IGlobalVariables private globalVariables;// Global variables instance
    uint256 private yieldsFromLrts;// Yields from LRTs during withdraw
    uint256 private yieldsFromLiquidatedLrts;// Yields from LRTs which are liquidated
    mapping(IBorrowing.AssetName => uint256 collateralAmountDeposited) public depositedCollateralAmountInWei;// Collaterals deposited in this chain
    mapping(IBorrowing.AssetName => uint256 collateralAmountDepositedInUsd) private depositedCollateralAmountInUsd;// Collaterals deposited in this chain in usd
    uint256 public totalVolumeOfBorrowersAmountLiquidatedInWei; // Total collateral liquidated in ETH value
    mapping(IBorrowing.AssetName => uint256 collateralAmountLiquidated) public liquidatedCollateralAmountInWei;// Collaterals deposited in this chain
    /**
     * @dev initialize function to initialize the contract
     * @param borrowingAddress borrowingAddress
     * @param usdaAddress usdaAddress
     * @param abondAddress abondAddress
     * @param cdsContractAddress cdsContractAddress
     * @param borrowLiquidationAddress borrowLiquidationAddress
     * @param usdtAddress usdtAddress
     * @param globalVariablesAddress globalVariablesAddress
     */
    function initialize(
        address borrowingAddress,
        address usdaAddress,
        address abondAddress,
        address cdsContractAddress,
        address borrowLiquidationAddress,
        address usdtAddress,
        address globalVariablesAddress
        ) initializer public{
        // intialize the owner of the contract 
        __Ownable_init(msg.sender);
        // Initialize the uups proxy contract
        __UUPSUpgradeable_init();
        cdsContract = cdsContractAddress;
        borrow = IBorrowing(borrowingAddress);
        usda = IUSDa(usdaAddress);
        abond = IABONDToken(abondAddress);
        usdt = IERC20(usdtAddress);
        globalVariables = IGlobalVariables(globalVariablesAddress);
        borrowLiquidation = borrowLiquidationAddress;
        PRECISION = 1e18;
        CUMULATIVE_PRECISION = 1e27;
    }

    function _authorizeUpgrade(address newImplementation) internal onlyOwner override{}

    /**
     * @dev modifier to check whether the caller is one of the core contract or not
     */
    modifier onlyCoreContracts() {
        require( 
            msg.sender == address(borrow) ||  msg.sender == cdsContract || msg.sender == borrowLiquidation || msg.sender == address(globalVariables), 
            "This function can only called by Core contracts");
        _;
    }
    /**
     * @dev Function to check if an address is a contract
     * @param account address to check whether the address is an contract address or EOA
     */
    function isContract(address account) internal view returns (bool) {
        return account.code.length > 0;
    }

    /**
     * @dev This function takes ethPrice, depositTime parameters to deposit eth into the contract and mint them back the USDa tokens.
     * @param ethPrice get current eth price 
     * @param depositTime get unixtime stamp at the time of deposit
     * @param user Borrower address
     * @param assetName Collateral type
     * @param depositingAmount Depositing collateral amount
     **/

    function deposit(
        address user,
        uint128 ethPrice,
        uint64  depositTime,
        IBorrowing.AssetName assetName,
        uint256 depositingAmount
    ) external payable onlyCoreContracts returns(DepositResult memory) {

        uint64 borrowerIndex;
        //check if borrower is depositing for the first time or not
        if (!borrowing[user].hasDeposited) {
            //change borrowerindex to 1
            borrowerIndex = borrowing[user].borrowerIndex = 1;

            //change hasDeposited bool to true after first deposit
            borrowing[user].hasDeposited = true;
            ++noOfBorrowers;
        }else {
            //increment the borrowerIndex for each deposit
            borrowerIndex = ++borrowing[user].borrowerIndex;
        }
    
        // update total deposited amount of the user
        borrowing[user].depositedAmountInETH += depositingAmount;

        // update deposited amount of the user
        borrowing[user].depositDetails[borrowerIndex].depositedAmountInETH = uint128(depositingAmount);

        depositedCollateralAmountInWei[assetName] += depositingAmount;

        depositedCollateralAmountInUsd[assetName] += (ethPrice * depositingAmount);

        //Total volume of borrowers in USD
        totalVolumeOfBorrowersAmountinUSD += (ethPrice * depositingAmount);

        //Total volume of borrowers in Wei
        totalVolumeOfBorrowersAmountinWei += depositingAmount;

        //Adding depositTime to borrowing struct
        borrowing[user].depositDetails[borrowerIndex].depositedTime = depositTime;

        //Adding ethprice to struct
        borrowing[user].depositDetails[borrowerIndex].ethPriceAtDeposit = ethPrice;

        // update deposited amount of the deposit in usd
        borrowing[user].depositDetails[borrowerIndex].depositedAmountUsdValue = uint128(depositingAmount) * ethPrice;

        borrowing[user].depositDetails[borrowerIndex].assetName = assetName;

        // If the collateral type is other than ETH, dont deposit to ext protocol
        if(assetName == IBorrowing.AssetName.ETH){

            uint256 externalProtocolDepositCollateral = ((depositingAmount * 25)/100);
            // Deposit ETH to aave
            depositToAaveByUser(externalProtocolDepositCollateral);
            // Deposit ETH to comp
            depositToCompoundByUser(externalProtocolDepositCollateral);

            borrowing[user].depositDetails[borrowerIndex].aBondCr = getExternalProtocolCumulativeRate(true);
        }
        // emit deposit event
        emit Deposit(user,depositingAmount);
        return DepositResult(borrowing[user].hasDeposited,borrowerIndex);
    }

    /**
     * @dev withdraw the deposited collateral
     * @param borrower borrower address
     * @param toAddress adrress to return collateral
     * @param amount amount of collateral to return
     * @param exchangeRate current exchanga rate of the deposited collateral
     * @param index deposit index
     */
    function withdraw(
        address borrower,
        address toAddress,
        uint256 amount,
        uint128 exchangeRate,
        uint64 index
    ) external payable onlyCoreContracts returns(bool){
        // Check the _amount is non zero
        require(amount > 0, "Cannot withdraw zero collateral");
        // Get the borrower deposit details
        DepositDetails memory depositDetails = borrowing[borrower].depositDetails[index];
        // check the deposit alredy withdrew or not
        require(depositDetails.withdrawed,"");

        // Updating lastEthVaultValue in borrowing
        // borrow.updateLastEthVaultValue(depositDetails.depositedAmountUsdValue);

        // Update the collateral data
        depositedCollateralAmountInUsd[depositDetails.assetName] -= depositDetails.depositedAmountUsdValue;
        depositedCollateralAmountInWei[depositDetails.assetName] -= depositDetails.depositedAmountInETH;
        // Updating total volumes
        totalVolumeOfBorrowersAmountinUSD -= depositDetails.depositedAmountUsdValue;
        totalVolumeOfBorrowersAmountinWei -= depositDetails.depositedAmountInETH;
        // Deduct tototalBorrowedAmountt
        borrowing[borrower].totalBorrowedAmount -= depositDetails.borrowedAmount;
        borrowing[borrower].depositedAmountInETH -= depositDetails.depositedAmountInETH;
        depositDetails.depositedAmountInETH = 0;

        // if user has no deposited collaterals then decrement number of borrowers
        if(borrowing[borrower].depositedAmountInETH == 0){
            --noOfBorrowers;
        }
        depositDetails.withdrawAmount += uint128(amount);
        // Based on collaterla type transfer the amounts 
        if(depositDetails.assetName == IBorrowing.AssetName.ETH){
            // Send the ETH to Borrower
            (bool sent,) = payable(toAddress).call{value: amount}("");
            require(sent, "Failed to send Collateral");
        }else{
            // Since the LRts and LSts are stored in treasury, we need to get the yields from them
            // The amount is multiplied with 2,since the collateral is other than eth
            uint256 tokenAmount = (amount * 2 ether)/exchangeRate;
            yieldsFromLrts += depositDetails.depositedAmount - ((depositDetails.depositedAmountInETH * 1 ether)/ exchangeRate);
            // Transfer collateral to user
            bool sent = IERC20(borrow.assetAddress(depositDetails.assetName)).transfer(toAddress, tokenAmount);
            // check the transfer is successfull or not
            require(sent, "Failed to send Collateral");
        }
        depositDetails.depositedAmount = 0;
        borrowing[borrower].depositDetails[index] = depositDetails;
        // emit withdraw event
        emit Withdraw(toAddress,amount);
        return true;
    }

    /**
     * @dev Withdraws ETH from external protocol
     * @param user ABOND holder address
     * @param aBondAmount ABOND amount, the user is redeeming
     */
    function withdrawFromExternalProtocol(address user, uint128 aBondAmount) external onlyCoreContracts returns(uint256){

        // Calculate the current cumulative rate
        uint256 aTokenBalance = aToken.balanceOf(address(this));
        _calculateCumulativeRate(aTokenBalance, Protocol.Aave);

        uint256 cETHBalance = comet.balanceOf(address(this));
        _calculateCumulativeRate(cETHBalance, Protocol.Compound);

        // Withdraw from external protocols
        uint256 redeemAmount = withdrawFromAaveByUser(user,aBondAmount) + withdrawFromCompoundByUser(user,aBondAmount);
        // Send the ETH to user
        (bool sent,) = payable(user).call{value: redeemAmount}("");
        // check the transfer is successfull or not
        require(sent, "Failed to send Ether");
        return redeemAmount;
    }

    /**
     * @dev Withdraws ETH from external protocol during liquidation
     * @param user ABOND holder address
     * @param index index of the deposit
     */
    function withdrawFromExternalProtocolDuringLiq(address user, uint64 index) external onlyCoreContracts returns(uint256){

        // Calculate the current cumulative rate
        uint256 aTokenBalance = aToken.balanceOf(address(this));
        _calculateCumulativeRate(aTokenBalance, Protocol.Aave);

        uint256 cETHBalance = comet.balanceOf(address(this));
        _calculateCumulativeRate(cETHBalance, Protocol.Compound);
        uint256 balanceBeforeWithdraw = address(this).balance;

        // Withdraw from external protocols
        uint256 redeemAmount = withdrawFromAaveDuringLiq(user,index) + withdrawFromCompoundDuringLiq(user,index);

        if(address(this).balance < redeemAmount + balanceBeforeWithdraw){
            revert Treasury_WithdrawExternalProtocolDuringLiqFailed();
        }
        return (redeemAmount - (borrowing[user].depositDetails[index].depositedAmount * 50)/100);
    }

    // //to increase the global external protocol count.
    // function increaseExternalProtocolCount() external {
    //     uint64 aaveDepositIndex = protocolDeposit[Protocol.Aave].depositIndex;
    //     uint64 compoundDepositIndex = protocolDeposit[Protocol.Compound].depositIndex;
    //     externalProtocolDepositCount = aaveDepositIndex > compoundDepositIndex ? aaveDepositIndex : compoundDepositIndex;
    // }

    /**
     * @dev This function depsoit 25% of the deposited ETH to AAVE and mint aTokens 
    */

    // function depositToAave() external onlyCoreContracts{

    //     //Divide the Total ETH in the contract to 1/4
    //     uint256 share = (externalProtocolCountTotalValue[externalProtocolDepositCount]*50)/100;

    //     //Check the amount to be deposited is greater than zero
    //     if(share == 0){
    //         revert Treasury_ZeroDeposit();
    //     }

    //     address poolAddress = aavePoolAddressProvider.getLendingPool();

    //     if(poolAddress == address(0)){
    //         revert Treasury_AavePoolAddressZero();
    //     }

    //     //Atoken balance before depsoit
    //     uint256 aTokenBeforeDeposit = aToken.balanceOf(address(this));

    //     // Call the deposit function in aave to deposit eth.
    //     wethGateway.depositETH{value: share}(poolAddress,address(this),0);

    //     uint256 creditedAmount = aToken.balanceOf(address(this));
    //     if(creditedAmount == protocolDeposit[Protocol.Aave].totalCreditedTokens){
    //         revert Treasury_AaveDepositAndMintFailed();
    //     }

    //     uint64 count = protocolDeposit[Protocol.Aave].depositIndex;
    //     count += 1;

    //     externalProtocolDepositCount++;

    //     // If it's the first deposit, set the cumulative rate to precision (i.e., 1 in fixed-point representation).
    //     if (count == 1 || protocolDeposit[Protocol.Aave].totalCreditedTokens == 0) {
    //         protocolDeposit[Protocol.Aave].cumulativeRate = CUMULATIVE_PRECISION; 
    //     } else {
    //         // Calculate the change in the credited amount relative to the total credited tokens so far.
    //         uint256 change = (aTokenBeforeDeposit - protocolDeposit[Protocol.Aave].totalCreditedTokens) * CUMULATIVE_PRECISION / protocolDeposit[Protocol.Aave].totalCreditedTokens;
    //         // Update the cumulative rate using the calculated change.
    //         protocolDeposit[Protocol.Aave].cumulativeRate = ((CUMULATIVE_PRECISION + change) * protocolDeposit[Protocol.Aave].cumulativeRate) / CUMULATIVE_PRECISION;
    //     }
    //     // Compute the discounted price of the deposit using the cumulative rate.
    //     protocolDeposit[Protocol.Aave].eachDepositToProtocol[count].discountedPrice = share * CUMULATIVE_PRECISION / protocolDeposit[Protocol.Aave].cumulativeRate;

    //     //Assign depositIndex(number of times deposited)
    //     protocolDeposit[Protocol.Aave].depositIndex = count;

    //     //Update the total amount deposited in Aave
    //     protocolDeposit[Protocol.Aave].depositedAmount += share;

    //     //Update the deposited time
    //     protocolDeposit[Protocol.Aave].eachDepositToProtocol[count].depositedTime = uint64(block.timestamp);

    //     //Update the deposited amount
    //     protocolDeposit[Protocol.Aave].eachDepositToProtocol[count].depositedAmount = uint128(share);

    //     //Update the deposited amount in USD
    //     uint128 ethPrice = protocolDeposit[Protocol.Aave].eachDepositToProtocol[count].ethPriceAtDeposit = uint128(borrow.getUSDValue());
    //     protocolDeposit[Protocol.Aave].eachDepositToProtocol[count].depositedUsdValue = share * ethPrice;

    //     //Update the total deposited amount in USD
    //     protocolDeposit[Protocol.Aave].depositedUsdValue = protocolDeposit[Protocol.Aave].depositedAmount * ethPrice;

    //     protocolDeposit[Protocol.Aave].eachDepositToProtocol[count].tokensCredited = uint128(creditedAmount) - uint128(protocolDeposit[Protocol.Aave].totalCreditedTokens);
    //     protocolDeposit[Protocol.Aave].totalCreditedTokens = creditedAmount;

    //     emit DepositToAave(count,share);
    // }

    /**
    * @dev Calculates the interest for a particular deposit based on its count for Aave.
    * @param count The deposit index (or count) for which the interest needs to be calculated.
    * @return interestValue The computed interest amount for the specified deposit.
    */

    //! have valid names for input parameters
    // function calculateInterestForDepositAave(uint64 count) public view returns (uint256) {
        
    //     // Ensure the provided count is within valid range
    //     if(count > protocolDeposit[Protocol.Aave].depositIndex || count == 0) {
    //         revert("Invalid count provided");
    //     }

    //     // Get the current credited amount from aToken
    //     uint256 creditedAmount = aToken.balanceOf(address(this));

    //     // Calculate the change rate based on the difference between the current credited amount and the total credited tokens 
    //     uint256 change = (creditedAmount - protocolDeposit[Protocol.Aave].totalCreditedTokens) * CUMULATIVE_PRECISION / protocolDeposit[Protocol.Aave].totalCreditedTokens;

    //     // Compute the current cumulative rate using the change and the stored cumulative rate
    //     uint256 currentCumulativeRate = (CUMULATIVE_PRECISION + change) * protocolDeposit[Protocol.Aave].cumulativeRate / CUMULATIVE_PRECISION;
        
    //     // Calculate the present value of the deposit using the current cumulative rate and the stored discounted price for the deposit
    //     uint256 presentValue = currentCumulativeRate * protocolDeposit[Protocol.Aave].eachDepositToProtocol[count].discountedPrice / CUMULATIVE_PRECISION;

    //     // Compute the interest by subtracting the original deposited amount from the present value
    //     uint256 interestValue = presentValue - protocolDeposit[Protocol.Aave].eachDepositToProtocol[count].depositedAmount;
        
    //     // Return the computed interest value
    //     return interestValue;
    // }

    /**
     * @dev This function withdraw ETH from AAVE.
     * @param index index of aave deposit 
     */

    // function withdrawFromAave(uint64 index) external onlyCoreContracts{

    //     //Check the deposited amount in the given index is already withdrawed
    //     require(!protocolDeposit[Protocol.Aave].eachDepositToProtocol[index].withdrawed,"Already withdrawed in this index");
    //     uint256 creditedAmount = aToken.balanceOf(address(this));
    //     // Calculate the change rate based on the difference between the current credited amount and the total credited tokens 
    //     uint256 change = (creditedAmount - protocolDeposit[Protocol.Aave].totalCreditedTokens) * CUMULATIVE_PRECISION / protocolDeposit[Protocol.Aave].totalCreditedTokens;

    //     // Compute the current cumulative rate using the change and the stored cumulative rate
    //     uint256 currentCumulativeRate = (CUMULATIVE_PRECISION + change) * protocolDeposit[Protocol.Aave].cumulativeRate / CUMULATIVE_PRECISION;
    //     protocolDeposit[Protocol.Aave].cumulativeRate = currentCumulativeRate;
    //     //withdraw amount
    //     uint256 amount = (currentCumulativeRate * protocolDeposit[Protocol.Aave].eachDepositToProtocol[index].discountedPrice)/CUMULATIVE_PRECISION;
    //     address poolAddress = aavePoolAddressProvider.getLendingPool();

    //     if(poolAddress == address(0)){
    //         revert Treasury_AavePoolAddressZero();
    //     }

    //     aToken.approve(aaveWETH,amount);
    //     protocolDeposit[Protocol.Aave].eachDepositToProtocol[index].interestGained = uint128(amount) - protocolDeposit[Protocol.Aave].eachDepositToProtocol[index].depositedAmount;

    //     // Call the withdraw function in aave to withdraw eth.
    //     wethGateway.withdrawETH(poolAddress,amount,address(this));

    //     uint256 aaveToken = aToken.balanceOf(address(this));
    //     if(aaveToken == protocolDeposit[Protocol.Aave].totalCreditedTokens){
    //         revert Treasury_AaveWithdrawFailed();
    //     }

    //     //Update the total amount deposited in Aave
    //     //protocolDeposit[Protocol.Aave].depositedAmount -= amount;

    //     //Set withdrawed to true
    //     protocolDeposit[Protocol.Aave].eachDepositToProtocol[index].withdrawed = true;

    //     //Update the withdraw time
    //     protocolDeposit[Protocol.Aave].eachDepositToProtocol[index].withdrawTime = uint64(block.timestamp);

    //     //Update the withdrawed amount in USD
    //     uint128 ethPrice = protocolDeposit[Protocol.Aave].eachDepositToProtocol[index].ethPriceAtWithdraw = uint64(borrow.getUSDValue());
    //     protocolDeposit[Protocol.Aave].eachDepositToProtocol[index].withdrawedUsdValue = amount * ethPrice;

    //     //Update the total deposited amount in USD
    //     protocolDeposit[Protocol.Aave].depositedUsdValue = protocolDeposit[Protocol.Aave].depositedAmount * ethPrice;
    //     //! why we are updating deposited value

    //     protocolDeposit[Protocol.Aave].totalCreditedTokens = aaveToken; 

    //     emit WithdrawFromAave(index,amount);
    // }

    /**
     * @dev This function depsoit 25% of the deposited ETH to COMPOUND and mint cETH. 
    */

    // function depositToCompound() external onlyCoreContracts{

    //     //Divide the Total ETH in the contract to 1/4
    //     uint256 share = (externalProtocolCountTotalValue[externalProtocolDepositCount - 1]*50)/100;

    //     //Check the amount to be deposited is greater than zero       
    //     if(share == 0){
    //         revert Treasury_ZeroDeposit();
    //     }

    //     // Call the deposit function in Coumpound to deposit eth.
    //     comet.mint{value: share}();

    //     uint256 creditedAmount = comet.balanceOf(address(this));

    //     if(creditedAmount == protocolDeposit[Protocol.Compound].totalCreditedTokens){
    //         revert Treasury_CompoundDepositAndMintFailed();
    //     }

    //     uint64 count = protocolDeposit[Protocol.Compound].depositIndex;
    //     count += 1;

    //     //Assign depositIndex(number of times deposited)
    //     protocolDeposit[Protocol.Compound].depositIndex = count;

    //     //Update the total amount deposited in Compound
    //     protocolDeposit[Protocol.Compound].depositedAmount += share;

    //     //Update the deposited time
    //     protocolDeposit[Protocol.Compound].eachDepositToProtocol[count].depositedTime = uint64(block.timestamp);

    //     //Update the deposited amount
    //     protocolDeposit[Protocol.Compound].eachDepositToProtocol[count].depositedAmount = uint128(share);

    //     //Update the deposited amount in USD
    //     uint128 ethPrice = protocolDeposit[Protocol.Compound].eachDepositToProtocol[count].ethPriceAtDeposit = uint128(borrow.getUSDValue());
    //     protocolDeposit[Protocol.Compound].eachDepositToProtocol[count].depositedUsdValue = share * ethPrice;

    //     //Update the total deposited amount in USD
    //     protocolDeposit[Protocol.Compound].depositedUsdValue = protocolDeposit[Protocol.Compound].depositedAmount * ethPrice;

    //     protocolDeposit[Protocol.Compound].eachDepositToProtocol[count].tokensCredited = uint128(creditedAmount) - uint128(protocolDeposit[Protocol.Compound].totalCreditedTokens);
    //     protocolDeposit[Protocol.Compound].totalCreditedTokens = creditedAmount;

    //     emit DepositToCompound(count,share);
    // }

    /**
     * @dev This function withdraw ETH from COMPOUND.
     */

    // function withdrawFromCompound(uint64 index) external onlyCoreContracts{

    //     uint256 amount = protocolDeposit[Protocol.Compound].eachDepositToProtocol[index].tokensCredited;

    //     //Check the deposited amount in the given index is already withdrawed
    //     require(!protocolDeposit[Protocol.Compound].eachDepositToProtocol[index].withdrawed,"Already withdrawed in this index");

    //     //Check the amount to be withdraw is greater than zero
    //     if(amount == 0){
    //         revert Treasury_ZeroWithdraw();
    //     }

    //     // Call the redeem function in Compound to withdraw eth.
    //     comet.redeem(amount);
    //     uint256 cToken = comet.balanceOf(address(this));
    //     if(cToken == protocolDeposit[Protocol.Compound].totalCreditedTokens){
    //         revert Treasury_CompoundWithdrawFailed();
    //     }

    //     //Update the total amount deposited in Coumpound
    //     protocolDeposit[Protocol.Compound].depositedAmount -= amount;

    //     //Set withdrawed to true
    //     protocolDeposit[Protocol.Compound].eachDepositToProtocol[index].withdrawed = true;

    //     //Update the withdraw time
    //     protocolDeposit[Protocol.Compound].eachDepositToProtocol[index].withdrawTime = uint64(block.timestamp);

    //     //Update the withdraw amount in USD
    //     uint128 ethPrice = protocolDeposit[Protocol.Compound].eachDepositToProtocol[index].ethPriceAtWithdraw = uint128(borrow.getUSDValue());
    //     protocolDeposit[Protocol.Compound].eachDepositToProtocol[index].withdrawedUsdValue = amount * ethPrice;

    //     //Update the total deposited amount in USD
    //     protocolDeposit[Protocol.Compound].depositedUsdValue = protocolDeposit[Protocol.Compound].depositedAmount * ethPrice;

    //     protocolDeposit[Protocol.Compound].totalCreditedTokens -= amount;
    //     // protocolDeposit[Protocol.Compound].eachDepositToProtocol[index].interestGained = uint128(getInterestForCompoundDeposit(index));
    //     protocolDeposit[Protocol.Compound].eachDepositToProtocol[index].tokensCredited = 0;

    //     emit WithdrawFromCompound(index,amount);
    // }

    /**
    * @dev Calculates the accrued interest for a specific deposit based on the cTokens credited.
    *
    * The function retrieves the deposit details for the given count and determines
    * the interest accrued by comparing the equivalent ETH value of the cTokens at the
    * current exchange rate with the original deposited ETH amount.
    *
    * Interest = ((cTokens credited * current exchange rate) / scaling factor) - original deposited ETH
    *
    * @param depositor The deposit index/count for which the interest needs to be calculated.
    * @return The accrued interest for the specified deposit.
    */
    // function getInterestForCompoundDeposit(address depositor,uint64 index) public returns (uint256) {
    //     // Retrieve the deposit details for the specified count
    //     DepositDetails memory depositDetails = borrowing[depositor].depositDetails[index];
        
    //     // Obtain the current exchange rate from the Compound protocol
    //     uint256 currentExchangeRate = comet.exchangeRateCurrent();
        
    //     // Compute the equivalent ETH value of the cTokens at the current exchange rate
    //     // Taking into account the fixed-point arithmetic (scaling factor of 1e18)
    //     uint256 currentEquivalentEth = (depositDetails.cTokensCredited * currentExchangeRate) / PRECISION;

    //     // Calculate the accrued interest by subtracting the original deposited ETH 
    //     // amount from the current equivalent ETH value
    //     return currentEquivalentEth - ((depositDetails.depositedAmount * 25)/100);
    // }

    /**
     * calculates the interest gained by user from External protocol deposits
     */
    // function totalInterestFromExternalProtocol(address depositor, uint64 index) external view returns(uint256){
    //     uint64 count = borrowing[depositor].depositDetails[index].externalProtocolCount;
    //     uint256 interestGainedByUser;

    //     for(uint64 i = count;i < externalProtocolDepositCount;i++){

    //         EachDepositToProtocol memory aaveDeposit = protocolDeposit[Protocol.Aave].eachDepositToProtocol[i];
    //         EachDepositToProtocol memory compoundDeposit = protocolDeposit[Protocol.Compound].eachDepositToProtocol[i];

    //         if(i==1 || protocolDeposit[Protocol.Aave].eachDepositToProtocol[i-1].withdrawed){

    //             uint256 totalValue = (externalProtocolCountTotalValue[i] * 50)/100;
    //             uint256 currentValue = (borrowing[depositor].depositDetails[index].depositedAmount * 25)/100;
    //             uint256 totalInterestFromExtPro;

    //             if(aaveDeposit.withdrawed){
    //                 totalInterestFromExtPro += aaveDeposit.interestGained;
    //             }else{
    //                 totalInterestFromExtPro += calculateInterestForDepositAave(i);
    //             }

    //             uint256 ratio = ((currentValue * PRECISION)/totalValue);
    //             interestGainedByUser += ((ratio*totalInterestFromExtPro)/PRECISION);

    //         }
    //         if(i==1 || protocolDeposit[Protocol.Compound].eachDepositToProtocol[i-1].withdrawed){

    //             uint256 totalValue = (externalProtocolCountTotalValue[i] * 50)/100;
    //             uint256 currentValue = (borrowing[depositor].depositDetails[index].depositedAmount * 25)/100;
    //             uint256 totalInterestFromExtPro;

    //             if(compoundDeposit.withdrawed){
    //                 totalInterestFromExtPro += compoundDeposit.interestGained;
    //             }else{
    //                 // totalInterestFromExtPro += getInterestForCompoundDeposit(i);
    //             }

    //             uint256 ratio = ((currentValue * PRECISION)/totalValue);
    //             interestGainedByUser += ((ratio*totalInterestFromExtPro)/PRECISION);
    //         }

    //     }

    //     return interestGainedByUser;
    // }

    /**
     * @dev Calculates the yields from external protocol
     * @param user Address of the abond holder
     * @param aBondAmount ABOND amount
     */
    function calculateYieldsForExternalProtocol(address user,uint128 aBondAmount) public view onlyCoreContracts returns (uint256) {
        // Get the ABOND state of the user
        State memory userState = abond.userStates(user);
        // Calculate deposited amount
        uint128 depositedAmount = (aBondAmount * userState.ethBacked)/PRECISION;
        // Calculate normalized amount
        uint256 normalizedAmount = (depositedAmount * CUMULATIVE_PRECISION)/userState.cumulativeRate;

        //get the current cumulative rates of the external protocols
        uint256 currentCumulativeRateAave = getCurrentCumulativeRate(aToken.balanceOf(address(this)),Protocol.Aave);
        uint256 currentCumulativeRateComp = getCurrentCumulativeRate(comet.balanceOf(address(this)),Protocol.Compound);
        // Find which is smaller cr
        uint256 currentCumulativeRate = currentCumulativeRateAave < currentCumulativeRateComp ? currentCumulativeRateAave : currentCumulativeRateComp;
        //withdraw amount
        uint256 amount = (currentCumulativeRate * normalizedAmount)/CUMULATIVE_PRECISION;
        
        return amount;
    }

    // UPDATE FUNcTIONS

    /**
     * @dev updates the user deposit details
     * @param depositor Address of the user
     * @param depositDetail updated deposit details to store
     */
    function updateDepositDetails(
        address depositor,
        uint64 index,DepositDetails memory depositDetail
    ) external onlyCoreContracts{
            borrowing[depositor].depositDetails[index] = depositDetail;
    }

    /**
     * @dev update whether the user has borrowed or not
     * @param borrower address of the user
     * @param borrowed boolean to store
     */
    function updateHasBorrowed(address borrower,bool borrowed) external onlyCoreContracts{
        borrowing[borrower].hasBorrowed = borrowed;
    }

    /**
     * @dev update the user total deposited amount
     * @param borrower address of the user
     * @param amount deposited amount
     */
    function updateTotalDepositedAmount(address borrower,uint128 amount) external onlyCoreContracts{
        borrowing[borrower].depositedAmountInETH -= amount;
    }

    /**
     * @dev update the user total borrowed amount
     * @param borrower address of the user
     * @param amount borrowed amount
     */
    function updateTotalBorrowedAmount(address borrower,uint256 amount) external onlyCoreContracts{
        borrowing[borrower].totalBorrowedAmount += amount;
    }

    /**
     * @dev update the total interest gained for the protocol
     * @param amount interest amount
     */
    function updateTotalInterest(uint256 amount) external onlyCoreContracts{
        totalInterest += amount;
    }

    /**
     * @dev update the total interest gained from liquidation for the protocol
     * @param amount interest amount
     */
    function updateTotalInterestFromLiquidation(uint256 amount) external onlyCoreContracts{
        totalInterestFromLiquidation += amount;
    }

    /**
     * @dev update abond usda pool
     * @param amount usda amount
     * @param operation whether to add or subtract
     */
    function updateAbondUSDaPool(uint256 amount,bool operation) external onlyCoreContracts{
        require(amount != 0, "Treasury:Amount should not be zero");
        if(operation){
            abondUSDaPool += amount;
        }else{
            abondUSDaPool -= amount;
        }
    }

    /**
     * @dev update usdaGainedFromLiquidation
     * @param amount usda amount
     * @param operation whether to add or subtract
     */
    function updateUSDaGainedFromLiquidation(uint256 amount,bool operation) external onlyCoreContracts{
        if(operation){
            usdaGainedFromLiquidation += amount;
        }else{
            usdaGainedFromLiquidation -= amount;
        }
    }

    // function updateEthProfitsOfLiquidators(uint256 amount,bool operation) external onlyCoreContracts{
    //     require(amount != 0, "Treasury:Amount should not be zero");
    //     if(operation){
    //         // ethProfitsOfLiquidators += amount;
    //         omniChainData.ethProfitsOfLiquidators += amount;

    //     }else{
    //         // ethProfitsOfLiquidators -= amount;
    //         omniChainData.ethProfitsOfLiquidators += amount;
    //     }
    //     globalVariables.setOmniChainData(omniChainData);
    // }

    /**
     * @dev updates totalVolumeOfBorrowersAmountinWei and totalVolumeOfBorrowersAmountLiquidatedInWei
     * @param amount collateral amount in eth value
     */
    function updateTotalVolumeOfBorrowersAmountinWei(uint256 amount) external onlyCoreContracts{
        totalVolumeOfBorrowersAmountinWei -= amount;
        totalVolumeOfBorrowersAmountLiquidatedInWei += amount;
    }    

    /**
     * @dev updates the totalVolumeOfBorrowersAmountinUSD
     * @param amountInUSD collateral amount in usd value
     */
    function updateTotalVolumeOfBorrowersAmountinUSD(uint256 amountInUSD) external onlyCoreContracts{
        totalVolumeOfBorrowersAmountinUSD -= amountInUSD;
    }

    /**
     * @dev updates depositedCollateralAmountInWei
     * @param asset asset name
     * @param amount amount in wei
     */
    function updateDepositedCollateralAmountInWei(IBorrowing.AssetName asset,uint256 amount) external onlyCoreContracts{
        depositedCollateralAmountInWei[asset] -= amount;
        liquidatedCollateralAmountInWei[asset] += amount;
    }

    /**
     * @dev Updates depositedCollateralAmountInUsd
     * @param asset asset name
     * @param amountInUSD amount in usd
     */
    function updateDepositedCollateralAmountInUsd(IBorrowing.AssetName asset, uint256 amountInUSD) external onlyCoreContracts{
        depositedCollateralAmountInUsd[asset] -= amountInUSD;
    }

    /**
     * @dev updatse the interestFromExternalProtocolDuringLiquidation
     * @param amount interest 
     */
    function updateInterestFromExternalProtocol(uint256 amount) external onlyCoreContracts{
        interestFromExternalProtocolDuringLiquidation += amount;
    }

    /**
     * @dev updates usdaCollectedFromCdsWithdraw
     * @param amount usda amount
     */
    function updateUsdaCollectedFromCdsWithdraw(uint256 amount) external onlyCoreContracts{
        usdaCollectedFromCdsWithdraw += amount;
    }

    /**
     * @dev updates liquidatedCollateralCollectedFromCdsWithdraw
     * @param amount liquidated collateral amount deducted from cds user during withdraw
     */
    function updateLiquidatedETHCollectedFromCdsWithdraw(uint256 amount) external onlyCoreContracts{
        liquidatedCollateralCollectedFromCdsWithdraw += amount;
    }

    /**
     * @dev updates yieldsFromLiquidatedLrts
     * @param yields yields accured from liquidated till cds withdraw
     */
    function updateYieldsFromLiquidatedLrts(uint256 yields) external onlyCoreContracts{
        yieldsFromLiquidatedLrts += yields;
    }

    // GETTERS FUNCTIONS

    /**
     * @dev get the borrower details
     * @param depositor address of the borrower
     * @param index index of the deposit
     */
    function getBorrowing(address depositor,uint64 index) external view returns(GetBorrowingResult memory){
        return GetBorrowingResult(
            borrowing[depositor].borrowerIndex,
            borrowing[depositor].depositDetails[index]);
    }

    /**
     * @dev get the total deposited amount
     * @param borrower address of the borrower
     */
    function getTotalDeposited(address borrower) external view returns(uint256){
        return borrowing[borrower].depositedAmountInETH;
    }

    // function omniChainDataNoOfBorrowers() external view returns(uint128){
    //     return omniChainData.noOfBorrowers;
    // }

    // function omniChainDataTotalVolumeOfBorrowersAmountinWei() external view returns(uint256){
    //     return omniChainData.totalVolumeOfBorrowersAmountinWei;
    // }

    // function omniChainDataTotalVolumeOfBorrowersAmountinUSD() external view returns(uint256){
    //     return omniChainData.totalVolumeOfBorrowersAmountinUSD;
    // }

    // function omniChainDataEthProfitsOfLiquidators() external view returns(uint256){
    //     return omniChainData.ethProfitsOfLiquidators;
    // }

    /**
     * @dev get the aave cumulative rate 
     */
    function getAaveCumulativeRate() private view returns(uint128){
        return uint128(protocolDeposit[Protocol.Aave].cumulativeRate);
    }

    /**
     * @dev get the comp cumulative rate 
     */
    function getCompoundCumulativeRate() private view returns(uint128){
        return uint128(protocolDeposit[Protocol.Compound].cumulativeRate);
    }

    /**
     * @dev get the external protocol cumulative rate whether its max or minimum
     * @param maximum boolean, to tell whether to return max or min cumulative rate
     */

    function getExternalProtocolCumulativeRate(bool maximum) public view onlyCoreContracts returns(uint128){
        uint128 aaveCumulativeRate = getAaveCumulativeRate();
        uint128 compoundCumulativeRate = getCompoundCumulativeRate();
        if(maximum){
            if(aaveCumulativeRate > compoundCumulativeRate){
                return aaveCumulativeRate;
            }else{
                return compoundCumulativeRate;
            }
        }else{
            if(aaveCumulativeRate < compoundCumulativeRate){
                return aaveCumulativeRate;
            }else{
                return compoundCumulativeRate;
            }
        }
    }

    /**
     * @dev get the current cumulative rate
     * @param _balanceBeforeEvent external protocol tokens balance till last event
     * @param _protocol Which protocol
     */
    function getCurrentCumulativeRate(uint256 _balanceBeforeEvent, Protocol _protocol) internal view returns (uint256){
        uint256 currentCumulativeRate;
        // If it's the first deposit, set the cumulative rate to precision (i.e., 1 in fixed-point representation).
        if (protocolDeposit[_protocol].totalCreditedTokens == 0) {
            currentCumulativeRate = CUMULATIVE_PRECISION;
        } else {
            // Calculate the change in the credited amount relative to the total credited tokens so far.
            uint256 change = (_balanceBeforeEvent - protocolDeposit[_protocol].totalCreditedTokens) * CUMULATIVE_PRECISION / protocolDeposit[_protocol].totalCreditedTokens;
            // Update the cumulative rate using the calculated change.
            currentCumulativeRate = ((CUMULATIVE_PRECISION + change) * protocolDeposit[_protocol].cumulativeRate) / CUMULATIVE_PRECISION;
        }
        return currentCumulativeRate;
    }

    /**
     * @dev get the total eth in treasury contract
     */
    function getBalanceInTreasury() external view returns(uint256){
        return address(this).balance;
    }

    // /**
    //  * usda approval
    //  * @param _address address to spend
    //  * @param _amount usda amount
    //  */
    // function approveUSDa(address _address, uint _amount) external onlyCoreContracts{
    //     require(_address != address(0) && _amount != 0, "Input address or amount is invalid");
    //     bool state = usda.approve(_address, _amount);
    //     require(state == true, "Approve failed");
    // }

    // /**
    //  * usdt approval
    //  */
    // function approveUsdt(address _address, uint _amount) external onlyCoreContracts{
    //     require(_address != address(0) && _amount != 0, "Input address or amount is invalid");
    //     bool state = usdt.approve(_address, _amount);
    //     require(state == true, "Approve failed");
    // }
    
    /**
     * usda approval
     * @param assetName Token Name
     * @param spender address to spend
     * @param amount usda amount
     */
    function approveTokens(IBorrowing.AssetName assetName,address spender, uint amount) external onlyCoreContracts{
        require(assetName != IBorrowing.AssetName.DUMMY && spender != address(0) && amount != 0, "Invalid param");
        bool state = IERC20(borrow.assetAddress(assetName)).approve(spender, amount);
        require(state == true, "Approve failed");
    }

    /**
     * @dev This function withdraw interest.
     * @param toAddress The address to whom to transfer StableCoins.
     * @param amount The amount of stablecoins to withdraw.
     */

    function withdrawInterest(address toAddress,uint256 amount) external onlyOwner{
        require(toAddress != address(0) && amount != 0, "Input address or amount is invalid");
        require(amount <= (totalInterest + totalInterestFromLiquidation),"Treasury don't have enough interest");
        totalInterest -= amount;
        bool sent = usda.transfer(toAddress,amount);
        require(sent, "Failed to send Ether");
    }

    /**
     * @dev transfer eth from treasury
     * @param user address of the recepient
     * @param amount amount to transfer
     */
    function transferEthToCdsLiquidators(address user,uint128 amount) external onlyCoreContracts{
        require(user != address(0) && amount != 0, "Input address or amount is invalid");
        // Get the omnichain data
        IGlobalVariables.OmniChainData memory omniChainData = globalVariables.getOmniChainData();
        // Check whether treasury has enough collateral to transfer
        require(amount <= omniChainData.collateralProfitsOfLiquidators,"Treasury don't have enough ETH amount");
        omniChainData.collateralProfitsOfLiquidators -= amount;
        globalVariables.setOmniChainData(omniChainData);

        // Transfer ETH to user
        (bool sent,) = payable(user).call{value: amount}("");
        if(!sent){
            revert Treasury_EthTransferToCdsLiquidatorFailed();
        }
    }
    /**
     * @dev withdraw external protocol interest which is gained from liquidated ETH
     * @param toAddress Address to recieve interest
     * @param amount interest amount
     */
    function withdrawExternalProtocolInterest(address toAddress,uint128 amount) external onlyOwner{
        // Check the input params are non zero
        require(toAddress != address(0) && amount != 0, "Input address or amount is invalid");
        // Check the withdraw interest amount is less interestFromExternalProtocolDuringLiquidation
        require(amount <= interestFromExternalProtocolDuringLiquidation,"Treasury don't have enough interest amount");
        interestFromExternalProtocolDuringLiquidation -= amount;
        // Sent the eth(interest)
        (bool sent,) = payable(toAddress).call{value: amount}("");
        if(!sent){
            revert Treasury_WithdrawExternalProtocolInterestFailed();
        }
    }
    /**
     * @dev calculates the current cumulative rate
     * @param _balanceBeforeEvent baalnce of tokens before the event
     * @param _protocol External protocol name
     */
    function _calculateCumulativeRate(uint256 _balanceBeforeEvent, Protocol _protocol) internal returns(uint256){
        uint256 currentCumulativeRate;
        // If it's the first deposit, set the cumulative rate to precision (i.e., 1 in fixed-point representation).
        if (protocolDeposit[_protocol].totalCreditedTokens == 0) {
            currentCumulativeRate = CUMULATIVE_PRECISION;
        } else {
            // Calculate the change in the credited amount relative to the total credited tokens so far.
            uint256 change = (_balanceBeforeEvent - protocolDeposit[_protocol].totalCreditedTokens) * CUMULATIVE_PRECISION / protocolDeposit[_protocol].totalCreditedTokens;
            // Update the cumulative rate using the calculated change.
            currentCumulativeRate = ((CUMULATIVE_PRECISION + change) * protocolDeposit[_protocol].cumulativeRate) / CUMULATIVE_PRECISION;
        }
        protocolDeposit[_protocol].cumulativeRate = currentCumulativeRate;
        return currentCumulativeRate;
    }
    /**
     * @dev Deposit ETH to Aave
     * @param depositAmount Deposit ETH amount
     */
    function depositToAaveByUser(uint256 depositAmount) internal onlyCoreContracts{
        //Atoken balance before depsoit
        uint256 aTokenBeforeDeposit = aToken.balanceOf(address(this));
        // calculate the current cumulative rate
        _calculateCumulativeRate(aTokenBeforeDeposit, Protocol.Aave);
        // get the pool address from aave
        address poolAddress = aavePoolAddressProvider.getPool();

        if(poolAddress == address(0)){
            revert Treasury_AavePoolAddressZero();
        }
        // deposit eth to aave
        wethGateway.depositETH{value: depositAmount}(poolAddress,address(this),0);
        uint256 creditedAmount = aToken.balanceOf(address(this));
        protocolDeposit[Protocol.Aave].totalCreditedTokens = creditedAmount;
    }
    /**
     * @dev Deposit ETH to Compound
     * @param depositAmount Deposit ETH amount
     */
    function depositToCompoundByUser(uint256 depositAmount) internal onlyCoreContracts {
        //Ctoken balance before depsoit
        uint256 cTokenBeforeDeposit = comet.balanceOf(address(this));
        // calculate the current cumulative rate
        _calculateCumulativeRate(cTokenBeforeDeposit, Protocol.Compound);

        // Changing ETH into WETH
        WETH.deposit{value: depositAmount}();

        // Approve WETH to Comet
        WETH.approve(address(comet), depositAmount);

        // Call the deposit function in Coumpound to deposit eth.
        comet.supply(address(WETH), depositAmount);

        uint256 creditedAmount = comet.balanceOf(address(this));

        protocolDeposit[Protocol.Compound].totalCreditedTokens = creditedAmount;

    }
    /**
     * @dev Withdraw ETH from Aave
     * @param user User address
     * @param aBondAmount ABOND amount to redeem
     */
    function withdrawFromAaveByUser(address user,uint128 aBondAmount) internal returns(uint256){
        State memory userState = abond.userStates(user);
        uint128 depositedAmount = (aBondAmount * userState.ethBacked)/PRECISION;
        uint256 normalizedAmount = (depositedAmount * CUMULATIVE_PRECISION * 50)/ (userState.cumulativeRate * 100);
        
        //withdraw amount
        uint256 amount = (getExternalProtocolCumulativeRate(false) * normalizedAmount)/CUMULATIVE_PRECISION;
        // get the pool address from aave
        address poolAddress = aavePoolAddressProvider.getPool();

        if(poolAddress == address(0)){
            revert Treasury_AavePoolAddressZero();
        }

        aToken.approve(address(wethGateway),amount);

        // Call the withdraw function in aave to withdraw eth.
        wethGateway.withdrawETH(poolAddress,amount,address(this));

        protocolDeposit[Protocol.Aave].totalCreditedTokens = aToken.balanceOf(address(this));
        return amount;
    }
    /**
     * @dev Withdraw ETH from Compound
     * @param user User address
     * @param aBondAmount ABOND amount to redeem
     */
    function withdrawFromCompoundByUser(address user,uint128 aBondAmount) internal returns(uint256){
        State memory userState = abond.userStates(user);
        uint128 depositedAmount = (aBondAmount * userState.ethBacked)/PRECISION;
        uint256 normalizedAmount = (depositedAmount * CUMULATIVE_PRECISION * 50)/ (userState.cumulativeRate * 100);

        //withdraw amount
        uint256 amount = (getExternalProtocolCumulativeRate(false) * normalizedAmount)/CUMULATIVE_PRECISION;
        // withdraw from comp
        comet.withdraw(address(WETH), amount);

        protocolDeposit[Protocol.Compound].totalCreditedTokens = comet.balanceOf(address(this));
        // convert weth to eth
        WETH.withdraw(amount);
        return amount;
    }

    function withdrawFromAaveDuringLiq(address user,uint64 index) internal returns(uint256){
        DepositDetails memory depositDetail = borrowing[user].depositDetails[index];
        State memory userState = abond.userStatesAtDeposits(user, index);
        uint256 normalizedAmount = (depositDetail.depositedAmount * CUMULATIVE_PRECISION * 25)/ (userState.cumulativeRate * 100);
        
        //withdraw amount
        uint256 amount = (getExternalProtocolCumulativeRate(false) * normalizedAmount)/CUMULATIVE_PRECISION;
        // get the pool address from aave
        address poolAddress = aavePoolAddressProvider.getPool();

        if(poolAddress == address(0)){
            revert Treasury_AavePoolAddressZero();
        }

        aToken.approve(address(wethGateway),amount);

        // Call the withdraw function in aave to withdraw eth.
        wethGateway.withdrawETH(poolAddress,amount,address(this));

        protocolDeposit[Protocol.Aave].totalCreditedTokens = aToken.balanceOf(address(this));
        return amount;
    }

    function withdrawFromCompoundDuringLiq(address user,uint64 index) internal returns(uint256){
        DepositDetails memory depositDetail = borrowing[user].depositDetails[index];
        State memory userState = abond.userStatesAtDeposits(user, index);
        uint256 normalizedAmount = (depositDetail.depositedAmount * CUMULATIVE_PRECISION * 25)/ (userState.cumulativeRate * 100);

        //withdraw amount
        uint256 amount = (getExternalProtocolCumulativeRate(false) * normalizedAmount)/CUMULATIVE_PRECISION;

        if(amount > comet.balanceOf(address(this))){
            amount = comet.balanceOf(address(this));
        }
        // withdraw from comp 
        comet.withdraw(address(WETH), amount);

        protocolDeposit[Protocol.Compound].totalCreditedTokens = comet.balanceOf(address(this));
        // convert weth to eth
        WETH.withdraw(amount);
        return amount;
    }

    /**
     * @dev sets the external protocol contract addresses
     * @param wethGatewayAddress wethGatewayAddress
     * @param cometAddress cometAddress
     * @param aavePoolAddressProviderAddress aavePoolAddressProviderAddress
     * @param aTokenAddress aTokenAddress
     * @param wethAddress wethAddress
     */
    function setExternalProtocolAddresses(
        address wethGatewayAddress,
        address cometAddress,
        address aavePoolAddressProviderAddress,
        address aTokenAddress,
        address wethAddress
    ) external onlyOwner{
        wethGateway = IWrappedTokenGatewayV3(wethGatewayAddress);     // 0xD322A49006FC828F9B5B37Ab215F99B4E5caB19C
        comet = CometMainInterface(cometAddress);                     // 0xA17581A9E3356d9A858b789D68B4d866e593aE94
        WETH = IWETH9(wethAddress);                                   // 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2
        aavePoolAddressProvider = IPoolAddressesProvider(
            aavePoolAddressProviderAddress);                          // 0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e
        aToken = IERC20(aTokenAddress);                               // 0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8
    }

    // /**
    //  * @dev Transfer the tokens and ETH to Global variables contract
    //  * @param amount tokens and ETH to transfer
    //  */
    function transferFundsToGlobal(uint256[4] memory transferAmounts) external onlyCoreContracts{
        // Loop through the array to transfer all amounts
        for(uint8 i = 0; i < 4; i++){
            // Transfer only if the amount is greater than zero
            if(transferAmounts[i] > 0){
                // Transfer tokens if the index not equal to 1, since index 1 is ETH
                if(i != 0){
                    IERC20(borrow.assetAddress(IBorrowing.AssetName(i+1))).transfer(
                        msg.sender,transferAmounts[i]);
                }else{
                    // Transfer ETH to global variable contract
                    (bool sent,) = payable(msg.sender).call{value: transferAmounts[i]}("");
                    require(sent, "Failed to send Ether");
                }
            }
        }
    }

    receive() external payable{}
}