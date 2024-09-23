// SPDX-License-Identifier: unlicensed
pragma solidity 0.8.20;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import "../interface/CDSInterface.sol";
import "../interface/IBorrowing.sol";
import "../interface/IUSDa.sol";
import "../interface/IBorrowLiquidation.sol";
import { IABONDToken } from "../interface/IAbond.sol";
import { BorrowLib } from "../lib/BorrowLib.sol";
import "../interface/ITreasury.sol";
import "../interface/IOptions.sol";
import "../interface/IMultiSign.sol";
import "../interface/IGlobalVariables.sol";
import "../interface/LiquidityPoolEtherFi.sol";
import "../interface/KelpDaoDeposit.sol";
import "hardhat/console.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import { MessagingFee} from "@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/OApp.sol";
import { OptionsBuilder } from "@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/libs/OptionsBuilder.sol";

contract Borrowing is IBorrowing,Initializable,UUPSUpgradeable,ReentrancyGuardUpgradeable,OwnableUpgradeable{

    IUSDa  public usda;             // our stablecoin
    CDSInterface    private cds;    // Cds instance
    IABONDToken private abond;      // abond stablecoin
    ITreasury   private treasury;   // Treasury instance
    IOptions    private options;    // options contract interface
    IMultiSign  private multiSign;  // Multisign instance
    IBorrowLiquidation private borrowLiquiation; // Borrow liquidation instance

    uint256 private _downSideProtectionLimit;// Downside protection limit usually 20%
    address private treasuryAddress; // treasury contract address
    address public admin; // admin address
    uint8   private LTV; // LTV is a percentage eg LTV = 60 is 60%, must be divided by 100 in calculations
    uint8   private APR; // APR
    uint256 private totalNormalizedAmount; // total normalized amount in protocol
    // address private priceFeedAddress; // ETH USD pricefeed address
    uint128 private lastEthprice; // previous eth price
    uint256 private lastVaultValue; // previous vault value
    uint256 private lastCDSPoolValue; // previous CDS pool value
    uint256 private lastTotalCDSPool; // total cds deposited amount
    uint256 public  lastCumulativeRate; // previous cumulative rate
    uint128 private lastEventTime;// Timestamp of last event occured in borrowing
    uint128 private noOfLiquidations; // total number of liquidation happened till now
    uint128 public ratePerSec;  // interest rate per second
    uint64  private bondRatio;  // ABOND : USDA ratio
    bytes32 private DOMAIN_SEPARATOR;
    uint256 private collateralRemainingInWithdraw;  // Collateral left during withdraw
    uint256 private collateralValueRemainingInWithdraw; // Collateral value left during withdraw
    // uint32  private dstEid; //! dst id
    using OptionsBuilder for bytes;// For using options in lz transactions
    // OmniChainBorrowingData private omniChainBorrowing; //! omniChainBorrowing contains global borrowing data(all chains)
    IGlobalVariables private globalVariables;   // Global variable instance

    mapping(AssetName => address assetAddress) public assetAddress; // Mapping to address of the collateral
    //  from AssetName enum Note: For native token ETH, the address is 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE
    //  Mapping of token address to price feed address
    mapping(address token => address priceFeed) private priceFeedAddress; // tokenToPriceFeed

    /**
     * @dev initialize function to initialize the contract
     * @param usdaAddress USDa token address
     * @param cdsAddress CDS contract address
     * @param abondTokenAddress ABOND token address
     * @param multiSignAddress Multi Sign contract address
     * @param priceFeedAddresses Price feed addresses
     * @param tokenAddresses Collateral token addresses
     * @param chainId Chain ID of the network
     * @param globalVariablesAddress Global variables contract addresses
     */
    function initialize( 
        address usdaAddress,
        address cdsAddress,
        address abondTokenAddress,
        address multiSignAddress,
        address[] memory priceFeedAddresses,
        address[] memory collateralAddresses,
        address[] memory tokenAddresses,
        uint64 chainId,
        address globalVariablesAddress
    ) initializer public{
        // Get the total number of collateral addresses
        uint16 noOfCollaterals = uint16(collateralAddresses.length);

        // Check the number of pricefeed addresses and collateral addresses are same
        if(noOfCollaterals != priceFeedAddresses.length){
            revert('Collateral addresses length and price feed addresses must be same length');
        }
        // Initialize the owner of the contract
        __Ownable_init(msg.sender);
        // Initialize the proxy
        __UUPSUpgradeable_init();
        usda = IUSDa(usdaAddress);
        cds = CDSInterface(cdsAddress);
        abond = IABONDToken(abondTokenAddress);
        multiSign = IMultiSign(multiSignAddress);
        globalVariables = IGlobalVariables(globalVariablesAddress);

        // Get the DOMAIN SEPARATOR
        DOMAIN_SEPARATOR = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint64 chainId,address verifyingContract)"),
            keccak256(bytes(BorrowLib.name)),
            keccak256(bytes(BorrowLib.version)),
            chainId,
            address(this)
        ));
        // Loop through the number of collateral address
        for(uint256 i = 0;i < noOfCollaterals;i++){
            // Assign the value(pricefeed address) for a key(collateral address)
            priceFeedAddress[collateralAddresses[i]] = priceFeedAddresses[i];
            // Assign the value(collateral address) for a key(collateral name ENUM)
            assetAddress[AssetName(i+1)] = collateralAddresses[i];
        }
        // Loop through the number of collateral address plus token addresses,starting with collateral address length + 1
        // SInce collateral addresses are allready assigned
        for(uint256 i = (noOfCollaterals+1);i <= (noOfCollaterals+tokenAddresses.length);i++){
            // Assign the value(token address) for a key(collateral(token) name ENUM)
            assetAddress[AssetName(i)] = tokenAddresses[i - (noOfCollaterals + 1)];
        }
        // (,lastEthprice) = getUSDValue(assetAddress[AssetName.ETH]);
        lastEthprice = 100000;
        lastEventTime = uint128(block.timestamp);
    }

    function _authorizeUpgrade(address newImplementation) internal onlyOwner override{}

    /**
     * @dev modifier to check whether the caller is an admin or not
     */
    modifier onlyAdmin(){
        require(msg.sender == admin,"Caller is not an admin");
        _;
    }
    /**
     * @dev modifier to check whether the caller is an treasury or not
     */
    modifier onlyTreasury(){
        require(msg.sender == treasuryAddress,"Function should only be called by treasury");
        _;
    }
    /**
     * @dev modifier to check whether the fucntion is paused or not
     */
    modifier whenNotPaused(IMultiSign.Functions _function) {
        require(!multiSign.functionState(_function),"Paused");
        _;
    }

    /**
     * @dev Function to check if an address is a contract
     * @param addr address to check whether the address is an contract address or EOA
     */    
    function isContract(address addr) internal view returns (bool) {
        uint size;
        assembly {
            size := extcodesize(addr)
        }
    return size > 0;
    }

    /**
     * @dev sets the treasury contract address and instance, can only be called by owner
     * @param _treasury Treasury contract address
     */

    function setTreasury(address _treasury) external onlyAdmin{
        // Check whether the input address is not a zero address and EOA
        require(_treasury != address(0) && isContract(_treasury) != false, "Treasury must be contract address & can't be zero address");
        // Check whether, the function have required approvals from owners to set
        require(multiSign.executeSetterFunction(IMultiSign.SetterFunctions(5)));
        treasury = ITreasury(_treasury);
        treasuryAddress = _treasury;
    }

    /**
     * @dev sets the options contract address and instance, can only be called by owner
     * @param _options Options contract address
     */
    function setOptions(address _options) external onlyAdmin{
        // Check whether the input address is not a zero address and EOA
        require(_options != address(0) && isContract(_options) != false, "Options must be contract address & can't be zero address");
        options = IOptions(_options);
    }

    /**
     * @dev sets the borrowLiquiation contract address and instance, can only be called by owner
     * @param _borrowLiquidation borrowLiquiation contract address
     */

    function setBorrowLiquidation(address _borrowLiquidation) external onlyAdmin{
        require(_borrowLiquidation != address(0) && isContract(_borrowLiquidation) != false, "Borrow Liquidation must be contract address & can't be zero address");
        borrowLiquiation = IBorrowLiquidation(_borrowLiquidation);
    }

    /**
     * @dev set admin address
     * @param _admin  admin address
     */
    function setAdmin(address _admin) external onlyOwner{
        // Check whether the input address is not a zero address and Contract Address
        require(_admin != address(0) && isContract(_admin) != true, "Admin can't be contract address & zero address");
        // Check whether, the function have required approvals from owners to set
        require(multiSign.executeSetterFunction(IMultiSign.SetterFunctions(3)));
        admin = _admin;    
    }

    /**
     * @dev Transfer USDa token to the borrower
     * @param _borrower Address of the borrower to transfer
     * @param _amount deposited amount of the borrower
     * @param _collateralPrice current collateral price
     * @param _optionFees option fees paid by borrower
     */
    function _transferToken(address _borrower,uint256 _amount,uint128 _collateralPrice,uint256 _optionFees) internal {
        // Check the borrower address is not a non zero address
        require(_borrower != address(0), "Borrower cannot be zero address");
        // Check the LTV is not 0
        require(LTV != 0, "LTV must be set to non-zero value before providing loans");
        
        // tokenValueConversion is in USD, and our stablecoin is pegged to USD in 1:1 ratio
        // Hence if tokenValueConversion = 1, then equivalent stablecoin tokens = tokenValueConversion

        uint256 tokensToLend = BorrowLib.tokensToLend(_amount, _collateralPrice, LTV);

        //Call the mint function in USDa
        //Mint 80% - options fees to borrower
        bool minted = usda.mint(_borrower, (tokensToLend - _optionFees));

        if(!minted){
            revert Borrowing_usdaMintFailed();
        }

        //Mint options fees to treasury
        bool treasuryMint = usda.mint(treasuryAddress, _optionFees);

        if(!treasuryMint){
            revert Borrowing_usdaMintFailed();
        }
    }

    /**
     * @dev Transfer Abond token to the borrower
     * @param _toAddress Address of the borrower to transfer
     * @param _index index of the position
     * @param _amount adond amount to transfer
     */

    function _mintAbondToken(address _toAddress, uint64 _index, uint256 _amount) internal returns(uint128){
        // Check the borrower address is not a non zero address
        require(_toAddress != address(0), "Borrower cannot be zero address");
        // Check the ABOND amount is not a zero
        require(_amount != 0,"Amount can't be zero");

        // ABOND:USDa = 4:1
        uint128 amount = BorrowLib.abondToMint(_amount,bondRatio);

        //Call the mint function in ABONDToken
        bool minted = abond.mint(_toAddress, _index, amount);

        if(!minted){
            revert Borrowing_abondMintFailed();
        }
        return amount;
    }

    /**
    * @dev Deposit collateral into the protocol and mint them back the USDa tokens.
    * @param depositParam Struct, which contains other params 
    **/

    function depositTokens (
        BorrowDepositParams memory depositParam
    ) external payable nonReentrant whenNotPaused(IMultiSign.Functions(0)) {
        BorrowDepositParams memory param = depositParam;
        uint256 depositingAmount = param.depositingAmount;
        // Check the deposting amount is non zero
        require(param.depositingAmount > 0, "Cannot deposit zero tokens");
        // require(msg.value > param.depositingAmount,"Borrowing: Don't have enough LZ fee");
        // Assign options for lz contract, here the gas is hardcoded as 350000, we got this through testing by iteration
        bytes memory _options = OptionsBuilder.newOptions().addExecutorLzReceiveOption(350000, 0);
        //! calculting fee 
        MessagingFee memory fee = globalVariables.quote(IGlobalVariables.FunctionToDo(1),param.assetName, _options, false);
        // Get the exchange rate for a collateral and eth price
        (uint128 exchangeRate, uint128 ethPrice) = getUSDValue(assetAddress[param.assetName]);
        // Calculate the depsoting amount in ETH
        param.depositingAmount = (exchangeRate * param.depositingAmount) / 1 ether;

        //Call calculateInverseOfRatio function to find ratio
        uint64 ratio = calculateRatio(param.depositingAmount, uint128(ethPrice));
        // Check whether the cds have enough funds to give downside prottection to borrower
        require(ratio >= (2 * BorrowLib.RATIO_PRECISION),"Not enough fund in CDS");

        // Call calculateOptionPrice in options contract to get options fees
        uint256 optionFees = options.calculateOptionPrice(ethPrice, param.volatility, param.depositingAmount, param.strikePercent);
        // Get the usda to give to user
        uint256 tokensToLend = BorrowLib.tokensToLend(param.depositingAmount, ethPrice, LTV);
        // If the collateral is other than ETH, get the collateral by transferFrom function in ERC20
        if(param.assetName != AssetName.ETH){
            IERC20(assetAddress[param.assetName]).transferFrom(msg.sender, treasuryAddress, depositingAmount);
        }
        //Call the deposit function in Treasury contract
        ITreasury.DepositResult memory depositResult = treasury.deposit{
            value: param.assetName == AssetName.ETH ? param.depositingAmount : 0}(
                msg.sender, ethPrice, uint64(block.timestamp), param.assetName, param.depositingAmount);

        //Check whether the deposit is successfull
        if(!depositResult.hasDeposited){
            revert Borrowing_DepositFailed();
        }
        // Get the ABOND cumulative rate for this index
        uint128 aBondCr = treasury.getExternalProtocolCumulativeRate(true);
        // If the collateral is ETH, set ABOND data, since ETH only is deposited in External protocol
        if(param.assetName == AssetName.ETH){
            abond.setAbondData(msg.sender, depositResult.borrowerIndex, BorrowLib.calculateHalfValue(param.depositingAmount), aBondCr);
        }
        // Call the transfer function to mint USDa
        _transferToken(msg.sender, param.depositingAmount, ethPrice, optionFees);
        // Get global omnichain data
        IGlobalVariables.OmniChainData memory omniChainData = globalVariables.getOmniChainData();
        IGlobalVariables.CollateralData memory collateralData = globalVariables.getOmniChainCollateralData(param.assetName);

        // Call calculateCumulativeRate in cds to split fees to cds users
        omniChainData.lastCumulativeRate = cds.calculateCumulativeRate(uint128(optionFees));
        // Modify omnichain data
        omniChainData.totalCdsDepositedAmountWithOptionFees += optionFees;

        //Get the deposit details from treasury
        ITreasury.GetBorrowingResult memory getBorrowingResult = treasury.getBorrowing(msg.sender,depositResult.borrowerIndex);
        ITreasury.DepositDetails memory depositDetail = getBorrowingResult.depositDetails;
        // Update the borrower details for this index
        depositDetail.depositedAmount = uint128(depositingAmount);
        depositDetail.borrowedAmount = uint128(tokensToLend);
        depositDetail.optionFees = uint128(optionFees);
        depositDetail.APR = APR;
        depositDetail.exchangeRateAtDeposit = exchangeRate;

        //Update variables in treasury
        treasury.updateHasBorrowed(msg.sender,true);
        treasury.updateTotalBorrowedAmount(msg.sender,tokensToLend);

        //Call calculateCumulativeRate() to get currentCumulativeRate
        calculateCumulativeRate();
        lastEventTime = uint128(block.timestamp);

        // Calculate normalizedAmount
        uint256 normalizedAmount = BorrowLib.calculateNormAmount(tokensToLend,lastCumulativeRate);

        // Update the borrower details for this index
        depositDetail.normalizedAmount = uint128(normalizedAmount);
        depositDetail.strikePrice = param.strikePrice * uint128(param.depositingAmount);

        //Update the deposit details
        treasury.updateDepositDetails(msg.sender,depositResult.borrowerIndex,depositDetail);

        // Calculate normalizedAmount of Protocol
        totalNormalizedAmount += normalizedAmount;
        lastEthprice = uint128(ethPrice);
        // s_lastRecordedPrice[param.assetName] = ethPrice;
        
        //! updating global data 
        omniChainData.normalizedAmount += normalizedAmount;
        // If its the first index of the borrower, then increment the numbers of borrowers in the protocol
        if(depositResult.borrowerIndex == 1){
            ++omniChainData.noOfBorrowers;
        }
        // Incrememt each index
        ++omniChainData.totalNoOfDepositIndices;
        // Update omnichain data
        omniChainData.totalVolumeOfBorrowersAmountinWei += param.depositingAmount;
        omniChainData.totalVolumeOfBorrowersAmountinUSD += (ethPrice * param.depositingAmount);
        // omniChainData.totalCollateralAmountinETH += (exchangeRate * param.depositingAmount)/1 ether;
        // Update individual collateral data
        ++collateralData.noOfIndices;
        collateralData.totalDepositedAmountInETH += param.depositingAmount;
        collateralData.totalDepositedAmount += depositingAmount;
        // Update the updated individual collateral data and omnichain data in global variables
        globalVariables.updateCollateralData(param.assetName, collateralData);
        globalVariables.setOmniChainData(omniChainData);
        //! Calling Omnichain send function
        globalVariables.send{value:fee.nativeFee}(IGlobalVariables.FunctionToDo(1), param.assetName, fee, _options,msg.sender);
        // Emit Deposit event
        emit Deposit(
            msg.sender,depositResult.borrowerIndex,param.depositingAmount,normalizedAmount,block.timestamp,ethPrice,tokensToLend,param.strikePrice,optionFees,param.strikePercent,APR,aBondCr);
    }

    /**
    @dev Withdraw Collateral from the protocol and burn usda.
    @param toAddress The address to whom to transfer collateral.
    @param index Index of the withdraw collateral position
    **/

    function withDraw(
        address toAddress,
        uint64  index
    ) external payable nonReentrant whenNotPaused(IMultiSign.Functions(1)){
        // check is _toAddress in not a zero address and isContract address
        require(toAddress != address(0) && isContract(toAddress) != true, "To address cannot be a zero and contract address");
        // Get the deposit details
        ITreasury.GetBorrowingResult memory getBorrowingResult = treasury.getBorrowing(msg.sender, index);
        ITreasury.DepositDetails memory depositDetail = getBorrowingResult.depositDetails;

        // check if borrowerIndex in BorrowerDetails of the msg.sender is greater than or equal to Index
        if(getBorrowingResult.totalIndex >= index ) {
            // Get the exchange rate for a collateral and eth price
            (uint128 exchangeRate, uint128 ethPrice) = getUSDValue(assetAddress[depositDetail.assetName]);
            // call Caluculate ratio function to update tha changes in cds and eth vaults
            calculateRatio(0, ethPrice);
            lastEthprice = uint128(ethPrice);
            // s_lastRecordedPrice[depositDetail.assetName] = collateralPrice;
            // Get omnichain data
            IGlobalVariables.OmniChainData memory omniChainData = globalVariables.getOmniChainData();
            IGlobalVariables.CollateralData memory collateralData = globalVariables.getOmniChainCollateralData(depositDetail.assetName);
            // Check if user amount in the Index has been liquidated or not
            require(!depositDetail.liquidated,"User amount has been liquidated");
            // check if withdrawed in depositDetail in borrowing of msg.seader is false or not
            if(depositDetail.withdrawed == false) {                                  
                // Calculate the borrowingHealth
                uint128 borrowingHealth = BorrowLib.calculateEthPriceRatio(
                        depositDetail.ethPriceAtDeposit, ethPrice);
                // Check the health is grater thsn 0.8 
                require(borrowingHealth > 8000,"BorrowingHealth is Low");
                // Calculate th borrower's debt
                uint256 borrowerDebt = BorrowLib.calculateDebtAmount(depositDetail.normalizedAmount, lastCumulativeRate);
                // Call calculateCumulativeRate function to get the interest
                calculateCumulativeRate();
                lastEventTime = uint128(block.timestamp);
                // Check whether the Borrower have enough Trinty
                require(usda.balanceOf(msg.sender) >= borrowerDebt, "User balance is less than required");
                            
                // Update the borrower's data
                {depositDetail.ethPriceAtWithdraw = uint64(ethPrice);
                depositDetail.withdrawed = true;
                depositDetail.withdrawTime = uint64(block.timestamp);
                depositDetail.totalDebtAmountPaid = borrowerDebt;
                // Calculate interest for the borrower's debt
                //uint256 interest = borrowerDebt - depositDetail.borrowedAmount;

                uint256 discountedCollateral;
                uint128 noOfAbondTokensminted;
                // If the collateral is EtH, update ABOND USDA pool, since ETH only deposited in EXT protocol
                if(depositDetail.assetName == AssetName.ETH){
                    discountedCollateral = BorrowLib.calculateDiscountedETH(
                        depositDetail.depositedAmount, ethPrice); // 0.4
                    omniChainData.abondUSDaPool += discountedCollateral;
                    treasury.updateAbondUSDaPool(discountedCollateral,true);
                    // Mint the ABondTokens
                    noOfAbondTokensminted = _mintAbondToken(msg.sender, index, discountedCollateral);
                }else{
                    discountedCollateral = 0;
                }
                // Calculate the USDa to burn
                uint256 burnValue = depositDetail.borrowedAmount - discountedCollateral;
                // Burn the USDa from the Borrower
                bool success = usda.burnFromUser(msg.sender, burnValue);
                if(!success){
                    revert Borrowing_WithdrawBurnFailed();
                }

                //Transfer the remaining USDa to the treasury
                bool transfer = usda.transferFrom(msg.sender,treasuryAddress,borrowerDebt - burnValue);
                if(!transfer){
                    revert Borrowing_WithdrawUSDaTransferFailed();
                }
                //Update totalNormalizedAmount
                totalNormalizedAmount -= depositDetail.normalizedAmount;
                omniChainData.normalizedAmount -= depositDetail.normalizedAmount;

                //Update totalInterest
                omniChainData.totalInterest += borrowerDebt - depositDetail.borrowedAmount;
                treasury.updateTotalInterest(borrowerDebt - depositDetail.borrowedAmount);

                // Update ABONDToken data
                depositDetail.aBondTokensAmount = noOfAbondTokensminted;

                // Update deposit details    
                treasury.updateDepositDetails(msg.sender, index, depositDetail);}             
                uint128 collateralToReturn;
                //Calculate current depositedAmount value
                uint128 depositedAmountvalue = (
                    depositDetail.depositedAmountInETH * depositDetail.ethPriceAtDeposit)/ethPrice;
                // If the health is greater than 1
                if(borrowingHealth > 10000){
                    // If the ethPrice is higher than deposit ethPrice,call withdrawOption in options contract
                    collateralToReturn = (depositedAmountvalue + (options.calculateStrikePriceGains(
                        depositDetail.depositedAmountInETH,depositDetail.strikePrice,uint64(ethPrice))));
                    // increment the difference between collatearla to  return and deposited amount in collateralRemainingInWithdraw
                    if(collateralToReturn > depositDetail.depositedAmount){
                        collateralRemainingInWithdraw += (collateralToReturn - depositDetail.depositedAmount);
                        omniChainData.collateralRemainingInWithdraw += (collateralToReturn - depositDetail.depositedAmount);
                    }else{
                        collateralRemainingInWithdraw += (depositDetail.depositedAmount - collateralToReturn);
                        omniChainData.collateralRemainingInWithdraw += (depositDetail.depositedAmount - collateralToReturn);
                    }
                    // increment the difference between collatearl to return and deposited amount 
                    // in collateralValueRemainingInWithdraw in usd
                    collateralValueRemainingInWithdraw += (collateralRemainingInWithdraw * ethPrice);
                    omniChainData.collateralValueRemainingInWithdraw += (collateralRemainingInWithdraw * ethPrice);
                // If the health is one collateralToReturn is depositedAmountvalue itself
                }else if(borrowingHealth == 10000){
                    collateralToReturn = depositedAmountvalue;
                // If the health is between 0.8 and 1 collateralToReturn is depositedAmountInETH itself
                }else if(8000 < borrowingHealth && borrowingHealth < 10000) {
                    collateralToReturn = depositDetail.depositedAmountInETH;
                }else{
                    revert("BorrowingHealth is Low");
                }
                // Calculate the 50% of colllateral to return
                collateralToReturn = BorrowLib.calculateHalfValue(collateralToReturn);
                // Assign options for lz contract, here the gas is hardcoded as 350000, we got this through testing by iteration
                bytes memory _options = OptionsBuilder.newOptions().addExecutorLzReceiveOption(350000, 0);
                //! calculting fee 
                MessagingFee memory fee = globalVariables.quote(IGlobalVariables.FunctionToDo(1), depositDetail.assetName, _options, false);
                // update the global omnichain data
                if(treasury.getTotalDeposited(msg.sender) == depositDetail.depositedAmountInETH){
                    --omniChainData.noOfBorrowers;
                }
                --omniChainData.totalNoOfDepositIndices;
                omniChainData.totalVolumeOfBorrowersAmountinWei -= depositDetail.depositedAmount;
                omniChainData.totalVolumeOfBorrowersAmountinUSD -= depositDetail.depositedAmountUsdValue;
                omniChainData.vaultValue -= depositDetail.depositedAmountUsdValue;
                // Update the individual collateral omnichain data
                --collateralData.noOfIndices;
                collateralData.totalDepositedAmount -= depositDetail.depositedAmount;
                collateralData.totalDepositedAmountInETH -= depositDetail.depositedAmountInETH;
                // Update the updated individual collateral data and omnichain data in global variables
                globalVariables.updateCollateralData(depositDetail.assetName, collateralData);
                globalVariables.setOmniChainData(omniChainData);

                // Call withdraw in treasury
                bool sent = treasury.withdraw(msg.sender, toAddress,collateralToReturn,exchangeRate, index);
                if(!sent){
                    revert Borrowing_WithdrawEthTransferFailed();
                }

                //! Calling Omnichain send function
                globalVariables.send{value:fee.nativeFee}(IGlobalVariables.FunctionToDo(1), depositDetail.assetName, fee, _options,msg.sender);
                emit Withdraw(msg.sender, index,block.timestamp,collateralToReturn,depositDetail.aBondTokensAmount,borrowerDebt);
            }else{
                // update withdrawed to true
                revert("User already withdraw entire amount");
            }
        }else {
            // revert if user doens't have the perticular index
            revert("User doens't have the perticular index");
        }
    }
    /**
     * @dev redeem eth yields from ext protocol by returning abond 
     * @param user Address of the abond holder
     * @param aBondAmount ABOND amount to use for redeem
     * 
     */
    function redeemYields(address user,uint128 aBondAmount) public returns(uint256){
        // Call redeemYields function in Borrow Library
        return (BorrowLib.redeemYields(user, aBondAmount, address(usda), address(abond), address(treasury)));
    }
    /**
     * @dev Get the yields from ext protocol
     * @param user Address of the abond holder
     * @param aBondAmount ABOND amount to use for redeem
     */
    function getAbondYields(address user,uint128 aBondAmount) public view returns(uint128,uint256,uint256){
        // Call getAbondYields function in Borrow Library
        return (BorrowLib.getAbondYields(user, aBondAmount, address(abond), address(treasury)));
    }

    /**
     * @dev This function liquidate ETH which are below downside protection.
     * @param user The address to whom to liquidate ETH.
     * @param index Index of the borrow
     * @param liquidationType Liquidation type to execute
     */

    function liquidate(
        address user,
        uint64 index,
        IBorrowing.LiquidationType liquidationType
    ) external payable whenNotPaused(IMultiSign.Functions(2)) onlyAdmin{

        // Check whether the user address is non zero address
        require(user != address(0), "To address cannot be a zero address");
        // Check whether the user address is admin address
        require(msg.sender != user,"You cannot liquidate your own assets!");

        // Call calculate cumulative rate fucntion to get interest
        calculateCumulativeRate();
        // Assign options for lz contract, here the gas is hardcoded as 350000, we got this through testing by iteration
        bytes memory _options = OptionsBuilder.newOptions().addExecutorLzReceiveOption(350000, 0);
        // Get the deposit details
        ITreasury.GetBorrowingResult memory getBorrowingResult = treasury.getBorrowing(user, index);
        // Calculating fee for lz transaction
        MessagingFee memory fee = globalVariables.quote(IGlobalVariables.FunctionToDo(2), getBorrowingResult.depositDetails.assetName, _options, false);
        // Increment number of liquidations
        ++noOfLiquidations;
        (, uint128 ethPrice) = getUSDValue(assetAddress[AssetName.ETH]);
        // Call the liquidateBorrowPosition function in borrowLiquiation contract
        (CDSInterface.LiquidationInfo memory liquidationInfo ) = borrowLiquiation.liquidateBorrowPosition{value: msg.value - fee.nativeFee}(
            user,
            index,
            uint64(ethPrice),
            liquidationType,
            lastCumulativeRate
        );

        //! Calling Omnichain send function
        globalVariables.sendForLiquidation{value:fee.nativeFee}(
            IGlobalVariables.FunctionToDo(2), 
            noOfLiquidations,
            liquidationInfo, 
            getBorrowingResult.depositDetails.assetName,
            fee, 
            _options,
            msg.sender);

    }
    /**
     * @dev Submit the order in Synthetix for closing position, can only be called by Borrowing contract
     */
    function closeThePositionInSynthetix() external onlyAdmin { 
        // call closeThePositionInSynthetix in borrowLiquiation contract
        borrowLiquiation.closeThePositionInSynthetix();
    }
    /**
     * @dev Execute the submitted order in Synthetix
     * @param priceUpdateData Bytes[] data to update price
     */
    function executeOrdersInSynthetix(
        bytes[] calldata priceUpdateData
    ) external onlyAdmin { 
        // call executeOrdersInSynthetix in borrowLiquiation contract
        borrowLiquiation.executeOrdersInSynthetix(priceUpdateData);
    }


    /**
     * @dev get the usd value of ETH and exchange rate for collaterals
     * @param token Collateral token address
     */
    function getUSDValue(address token) public view returns(uint128, uint128){
        // Get the instance of AggregatorV3Interface from chainlink
        AggregatorV3Interface priceFeed = AggregatorV3Interface(priceFeedAddress[token]);
        // Get the eth price
        (,int256 price,,,) = priceFeed.latestRoundData();
        // If the token is ETH
        if(token == assetAddress[AssetName.ETH]){
            // Return Exchange rate as 1 and ETH price with 2 decimals
            return(1 ether, uint128((uint256(price) / BorrowLib.PRECISION)));
        }else{
            (,uint128 ethPrice) = getUSDValue(assetAddress[AssetName.ETH]);
            // int256 usdValue = (price * int256(ethPrice))/1e18;
            // Return Exchange rate and ETH price with 2 decimals
            return (uint128(uint256(price)), ethPrice);
        }
    }
    /**
     * @dev Set the protocolo ltv
     * @param ltv loan to value ratio of the protocol
     */
    function setLTV(uint8 ltv) external onlyAdmin {
        // Check ltv is non zero
        require(ltv != 0, "LTV can't be zero");
        // Check whether, the function have required approvals from owners to set
        require(multiSign.executeSetterFunction(IMultiSign.SetterFunctions(0)));
        LTV = ltv;
    }
    /**
     * @dev set the abond and usda ratio
     * @param _bondRatio ABOND USDa ratio
     */
    function setBondRatio(uint64 _bondRatio) external onlyAdmin {
        // Check bond ratio is non zero
        require(_bondRatio != 0, "Bond Ratio can't be zero");
        // Check whether, the function have required approvals from owners to set
        require(multiSign.executeSetterFunction(IMultiSign.SetterFunctions(7)));
        bondRatio = _bondRatio;
    }

    /**
     * @dev return the LTV of the protocol
     */
    function getLTV() public view returns(uint8){
        return LTV;
    }

    // function getLastEthVaultValue() public view returns(uint256){
    //     return (lastEthVaultValue/100);
    // }

    /**
     * @dev update the last eth vault value
     * @param amount eth vault value
     */
    function updateLastEthVaultValue(uint256 amount) external onlyTreasury{
        // Check the amount is non zero
        require(amount != 0,"Last ETH vault value can't be zero");
        // Update global data
        IGlobalVariables.OmniChainData memory omniChainData = globalVariables.getOmniChainData();
        omniChainData.vaultValue -= amount;
        globalVariables.setOmniChainData(omniChainData);
    }

    /**
     * @dev calculate the ratio of CDS Pool/Eth Vault
     * @param amount amount to be depositing
     * @param currentEthPrice current eth price in usd
     */
    function calculateRatio(uint256 amount,uint128 currentEthPrice) public returns(uint64){

        if(currentEthPrice == 0){
            revert Borrowing_GettingETHPriceFailed();
        }
        // Get the omnichain data
        IGlobalVariables.OmniChainData memory omniChainData = globalVariables.getOmniChainData();
        // Get the return values from calculateRatio in library to store
        (uint64 ratio, IGlobalVariables.OmniChainData memory omniChainDataFromLib) = BorrowLib.calculateRatio(
            amount,
            currentEthPrice,
            lastEthprice,
            // s_lastRecordedPrice[assetName],
            omniChainData.totalNoOfDepositIndices,
            omniChainData.totalVolumeOfBorrowersAmountinWei,
            omniChainData.totalCdsDepositedAmount,
            omniChainData  //! using global data instead of individual chain data
            );

        //! updating global data 
        globalVariables.setOmniChainData(omniChainDataFromLib);

        return ratio;
    }
    /**
     * @dev set APR of the deposits
     * @param _APR apr of the protocol
     * @param _ratePerSec Interest rate per second
     */
    function setAPR(uint8 _APR, uint128 _ratePerSec) external whenNotPaused(IMultiSign.Functions(3)) onlyAdmin{
        // Check the input params are non zero
        require(_ratePerSec != 0 && _APR != 0,"Rate should not be zero");
        // Check whether, the function have required approvals from owners to set
        require(multiSign.executeSetterFunction(IMultiSign.SetterFunctions(1)));
        APR = _APR;
        ratePerSec = _ratePerSec;
    }

    /**
     * @dev calculate cumulative rate 
     */
    function calculateCumulativeRate() public returns(uint256){
        // Get the noOfBorrowers
        uint128 noOfBorrowers = treasury.noOfBorrowers();
        // Call calculateCumulativeRate in borrow library
        uint256 currentCumulativeRate = BorrowLib.calculateCumulativeRate(noOfBorrowers, ratePerSec, lastEventTime, lastCumulativeRate);
        lastCumulativeRate = currentCumulativeRate;
        return currentCumulativeRate;
    }
    /**
     * @dev updates the APR based on usda price
     * @param usdaPrice USDa price
     */
    function updateRatePerSecByUSDaPrice(uint32 usdaPrice) public onlyAdmin{
        // Check the usda price is non zero
        if(usdaPrice <= 0) revert("Invalid USDa price");
        // Get the new apr and rate per sec to update from library
        (ratePerSec, APR) = BorrowLib.calculateNewAPRToUpdate(usdaPrice);
    }
}