// SPDX-License-Identifier: LZBL-1.1
// Copyright 2023 LayerZero Labs Ltd.
// You may obtain a copy of the License at
// https://github.com/LayerZero-Labs/license/blob/main/LICENSE-LZBL-1.1

pragma solidity 0.8.20;

import { State, IABONDToken } from "../interface/IAbond.sol";
import "../interface/ITreasury.sol";
import "../interface/IUSDa.sol";
import "../interface/IBorrowing.sol";
import "../interface/IGlobalVariables.sol";
import "hardhat/console.sol";


library BorrowLib {

    uint128 constant PRECISION = 1e6;
    uint128 constant CUMULATIVE_PRECISION = 1e7;
    uint128 constant RATIO_PRECISION = 1e4;
    uint128 constant RATE_PRECISION = 1e27;
    uint128 constant USDA_PRECISION = 1e12;
    uint128 constant LIQ_AMOUNT_PRECISION = 1e10;

    string  public constant name = "Autonomint USD";
    string  public constant version = "1";
    bytes32 public constant PERMIT_TYPEHASH = keccak256("Permit(address holder,address spender,uint256 allowedAmount,bool allowed,uint256 expiry)");

    /**
     * @dev calculates the 50% of the input value
     * @param amount input amount
     */
    function calculateHalfValue(uint256 amount) public pure returns(uint128){
        return uint128((amount * 50)/100);
    }

    /**
     * @dev calculates the normalized value based on given cumulative rate
     * @param amount amount
     * @param cumulativeRate cumulative rate
     */
    function calculateNormAmount(
        uint256 amount,
        uint256 cumulativeRate
    ) public pure returns(uint256){
        return (amount * RATE_PRECISION)/cumulativeRate;
    }

    /**
     * @dev calulates debt amount based on given cumulative rate
     * @param amount amount
     * @param cumulativeRate cumulative rate
     */
    function calculateDebtAmount(
        uint256 amount,
        uint256 cumulativeRate
    ) public pure returns(uint256){
        return (amount * cumulativeRate)/RATE_PRECISION;
    }

    /**
     * @dev calculates the ratio of current eth price to the deposit eth price
     * @param depositEthPrice eth pricd at deposit
     * @param currentEthPrice current eth Price
     */
    function calculateEthPriceRatio(
        uint128 depositEthPrice, 
        uint128 currentEthPrice
    ) public pure returns(uint128){
        return (currentEthPrice * 10000)/depositEthPrice;
    }

    /**
     * @dev calculates discounted eth
     * @param amount deposited collateral amount
     * @param ethPrice current eth price
     */
    function calculateDiscountedETH(
        uint256 amount,
        uint128 ethPrice
    ) public pure returns(uint256){
        // 80% of half of the deposited amount
        return ((((80*calculateHalfValue(amount))/100)*ethPrice)/100)/USDA_PRECISION;
    }

    /**
     * @dev calculates return to abond
     * @param depositedAmount deposited collateral
     * @param depositEthPrice eth price at deposit
     * @param returnToTreasury return to treasury(debt)
     */
    function calculateReturnToAbond(
        uint128 depositedAmount,
        uint128 depositEthPrice,
        uint128 returnToTreasury
    ) public pure returns(uint128){
        // 10% of the remaining amount
        return (((((depositedAmount * depositEthPrice)/USDA_PRECISION)/100) - returnToTreasury) * 10)/100;
    }
    
    /**
     * @dev calculates the ratio of cds pool value to the eth value
     * @param amount depositing collateral amount in eth
     * @param currentEthPrice current eth price
     * @param lastEthprice last recorded eth price
     * @param noOfDeposits no of deposirs till now in borrowing
     * @param totalCollateralInETH total collateral deposited in eth
     * @param latestTotalCDSPool total cds deposited amount
     * @param previousData last recorded global omnichain data
     */
    function calculateRatio(
        uint256 amount,
        uint128 currentEthPrice,
        uint128 lastEthprice,
        uint256 noOfDeposits,
        uint256 totalCollateralInETH,
        uint256 latestTotalCDSPool,
        IGlobalVariables.OmniChainData memory previousData
    ) public pure returns(uint64, IGlobalVariables.OmniChainData memory){

        uint256 netPLCdsPool;

        // Calculate net P/L of CDS Pool
        // if the current eth price is high
        if(currentEthPrice > lastEthprice){
            // profit, multiply the price difference with total collateral
            netPLCdsPool = (((currentEthPrice - lastEthprice) * totalCollateralInETH)/USDA_PRECISION)/100;
        }else{
            // loss, multiply the price difference with total collateral
            netPLCdsPool = (((lastEthprice - currentEthPrice) * totalCollateralInETH)/USDA_PRECISION)/100;
        }

        uint256 currentVaultValue;
        uint256 currentCDSPoolValue;
         
        // Check it is the first deposit
        if(noOfDeposits == 0){

            // Calculate the ethVault value
            previousData.vaultValue = amount * currentEthPrice;
            // Set the currentEthVaultValue to lastEthVaultValue for next deposit
            currentVaultValue = previousData.vaultValue;

            // Get the total amount in CDS
            // lastTotalCDSPool = cds.totalCdsDepositedAmount();
            previousData.totalCDSPool = latestTotalCDSPool;

            // BAsed on the eth prices, add or sub, profit and loss respectively
            if (currentEthPrice >= lastEthprice){
                currentCDSPoolValue = previousData.totalCDSPool + netPLCdsPool;
            }else{
                currentCDSPoolValue = previousData.totalCDSPool - netPLCdsPool;
            }

            // Set the currentCDSPoolValue to lastCDSPoolValue for next deposit
            previousData.cdsPoolValue = currentCDSPoolValue;
            currentCDSPoolValue = currentCDSPoolValue * USDA_PRECISION;

        }else{
            // find current vault value by adding current depositing amount
            currentVaultValue = previousData.vaultValue + (amount * currentEthPrice);
            previousData.vaultValue = currentVaultValue;

            // BAsed on the eth prices, add or sub, profit and loss respectively
            if(currentEthPrice >= lastEthprice){
                previousData.cdsPoolValue += netPLCdsPool;
            }else{
                previousData.cdsPoolValue -= netPLCdsPool;
            }

            previousData.totalCDSPool = latestTotalCDSPool;
            currentCDSPoolValue = previousData.cdsPoolValue * USDA_PRECISION;
        }

        // Calculate ratio by dividing currentEthVaultValue by currentCDSPoolValue,
        // since it may return in decimals we multiply it by 1e6
        uint64 ratio = uint64((currentCDSPoolValue * CUMULATIVE_PRECISION)/currentVaultValue);
        return (ratio, previousData);
    }

    /**
     * @dev calculates cumulative rate
     * @param noOfBorrowers total number of borrowers in the protocol
     * @param ratePerSec interest rate per second
     * @param lastEventTime last event timestamp
     * @param lastCumulativeRate previous cumulative rate
     */
    function calculateCumulativeRate(
        uint128 noOfBorrowers,
        uint256 ratePerSec,
        uint128 lastEventTime,
        uint256 lastCumulativeRate
    ) public view returns (uint256) {
        uint256 currentCumulativeRate;

        // If there is no borrowers in the protocol
        if (noOfBorrowers == 0) {
            // current cumulative rate is same as ratePeSec
            currentCumulativeRate = ratePerSec;
        } else {
            // Find time interval between last event and now
            uint256 timeInterval = uint128(block.timestamp) - lastEventTime;
            //calculate cumulative rate
            currentCumulativeRate = lastCumulativeRate * _rpow(ratePerSec, timeInterval, RATE_PRECISION);
            currentCumulativeRate = currentCumulativeRate / RATE_PRECISION;
        }
        return currentCumulativeRate;
    }

    /**
     * @dev tokensToLend based on LTV
     * @param depositedAmount deposited collateral amount
     * @param ethPrice current eth price
     * @param LTV ltv of the protocol
     */
    function tokensToLend(
        uint256 depositedAmount, 
        uint128 ethPrice, 
        uint8 LTV
    ) public pure returns(uint256){
        uint256 tokens = (depositedAmount * ethPrice * LTV) / (USDA_PRECISION * RATIO_PRECISION);
        return tokens;
    }

    /**
     * @dev calculates the abond amount to mint for the deposited amount
     * @param _amount deposited collateral amount
     * @param _bondRatio abond to usda ratio
     */
    function abondToMint(
        uint256 _amount, 
        uint64 _bondRatio
    ) public pure returns(uint128 amount){
        amount = (uint128(_amount) * USDA_PRECISION)/_bondRatio;
    }

    /**
     * @dev calculates the base number to multilpy with currrent apr
     * @param usdaPrice usda price with 1e4 precision
     */
    function calculateBaseToMultiply(uint32 usdaPrice) public pure returns (uint8 baseToMultiply){
        // usda price has 10000 precision
        if(usdaPrice < 9500){
            // baseToMultiply has 10 precision
            baseToMultiply = 50;
        }else if(usdaPrice < 9700 && usdaPrice >= 9500){
            baseToMultiply = 30;
        }else if(usdaPrice < 9800 && usdaPrice >= 9700){
            baseToMultiply = 20;
        }else if(usdaPrice < 9900 && usdaPrice >= 9800){
            baseToMultiply = 15;
        }else if(usdaPrice < 10100 && usdaPrice >= 9900){
            baseToMultiply = 10;
        }else if(usdaPrice < 10200 && usdaPrice >= 10100){
            baseToMultiply = 8;
        }else if(usdaPrice < 10500 && usdaPrice >= 10200){
            baseToMultiply = 5;
        }else{
            baseToMultiply = 1;
        }
    }

    /**
     * @dev calculates new apr
     * @param usdaPrice usda price with 1e4 precision
     */
    function calculateNewAPRToUpdate(uint32 usdaPrice) public pure returns(uint128 ratePerSec,uint8 newAPR){
        require(usdaPrice != 0, "Invalid USDa price");
        newAPR = 5 * calculateBaseToMultiply(usdaPrice);
        if(newAPR == 250){
            ratePerSec = 1000000007075835619725814915;
        }else if (newAPR == 150){
            ratePerSec = 1000000004431822129783699001;
        }else if(newAPR == 100){
            ratePerSec = 1000000003022265980097387650;
        }else if(newAPR == 75){
            ratePerSec = 1000000002293273137447730714;
        }else if(newAPR == 50){
            ratePerSec = 1000000001547125957863212448;
        }else if(newAPR == 40){
            ratePerSec = 1000000001243680656318820312;
        }else if(newAPR == 25){
            ratePerSec = 1000000000782997609082909351;
        }else if(newAPR == 5){
            ratePerSec = 1000000000158153903837946257;
        }
    }

    /**
     * @dev get abond yields for the given abond amount
     * @param user abond holder address
     * @param aBondAmount redeeming abond amount
     * @param abondAddress abond token address
     * @param treasuryAddress treasury address
     */
    function getAbondYields(
        address user,
        uint128 aBondAmount,
        address abondAddress,
        address treasuryAddress
    ) public view returns(uint128,uint256,uint256){
        // check abond amount is non zewro
        require(aBondAmount > 0,"Abond amount should not be zero");
        
        IABONDToken abond = IABONDToken(abondAddress);
        // get user abond state
        State memory userState = abond.userStates(user);
        // check user have enough abond
        require(aBondAmount <= userState.aBondBalance,"You don't have enough aBonds");

        ITreasury treasury = ITreasury(treasuryAddress);
        // calculate the yields
        uint256 redeemableAmount = treasury.calculateYieldsForExternalProtocol(user,aBondAmount);
        uint128 depositedAmount = (aBondAmount * userState.ethBacked)/1e18;
        // usda to abond gained by liqudation
        uint128 usdaToAbondRatioLiq = uint64(treasury.usdaGainedFromLiquidation() * RATE_PRECISION/ abond.totalSupply());
        uint256 usdaToTransfer = (usdaToAbondRatioLiq * aBondAmount) / RATE_PRECISION;

        return (depositedAmount,redeemableAmount,usdaToTransfer);
    }

    /**
     * @dev get liquidation amount proportions to get from each chains
     * @param _liqAmount liquidation amount needed
     * @param _totalCdsDepositedAmount total cds amount in this chain
     * @param _totalGlobalCdsDepositedAmount total global cds amount
     * @param _totalAvailableLiqAmount available liqidation amount in cds in this chain
     * @param _totalGlobalAvailableLiqAmountAmount available global liquidation amount in cds
     */
    function getLiquidationAmountProportions(
        uint256 _liqAmount,
        uint256 _totalCdsDepositedAmount,
        uint256 _totalGlobalCdsDepositedAmount,
        uint256 _totalAvailableLiqAmount,
        uint256 _totalGlobalAvailableLiqAmountAmount
    ) public pure returns (uint256){

        // Calculate other chain cds deposited amount
        uint256 otherChainCDSAmount = _totalGlobalCdsDepositedAmount - _totalCdsDepositedAmount;

        // calculate other chain available liq amount in cds
        uint256 totalAvailableLiqAmountInOtherChain = _totalGlobalAvailableLiqAmountAmount - _totalAvailableLiqAmount;

        // find the share of each chain
        uint256 share = (otherChainCDSAmount * LIQ_AMOUNT_PRECISION)/_totalGlobalCdsDepositedAmount;
        // amount to get from other chain
        uint256 liqAmountToGet = (_liqAmount * share)/LIQ_AMOUNT_PRECISION;
        // amount to get from this chain
        uint256 liqAmountRemaining = _liqAmount - liqAmountToGet;

        // if tha other chain dont have any available liquidation amount
        if(totalAvailableLiqAmountInOtherChain == 0){
            liqAmountToGet = 0;
        }else{
            // if the other chain dont have sufficient liq amount to get, get the remaining from thsi chain itself
            if(totalAvailableLiqAmountInOtherChain < liqAmountToGet) {
                liqAmountToGet = totalAvailableLiqAmountInOtherChain;
            }else{
                if(totalAvailableLiqAmountInOtherChain > liqAmountToGet && _totalAvailableLiqAmount < liqAmountRemaining){
                    liqAmountToGet += liqAmountRemaining - _totalAvailableLiqAmount;
                }else{
                    liqAmountToGet = liqAmountToGet;
                }
            }
        }
        return liqAmountToGet;
    }

    function getCdsProfitsProportions(
        uint128 _liqAmount,
        uint128 _liqAmountToGetFromOtherChain,
        uint128 _cdsProfits
    ) public pure returns (uint128){

        uint128 share = (_liqAmountToGetFromOtherChain * LIQ_AMOUNT_PRECISION)/_liqAmount;
        uint128 cdsProfitsForOtherChain = (_cdsProfits * share)/LIQ_AMOUNT_PRECISION;

        return cdsProfitsForOtherChain;
    }

    /**
     * @dev redeem abond yields
     * @param user abond holder address
     * @param aBondAmount redeeming abond amount
     * @param abondAddress abond token address
     * @param treasuryAddress treasury address
     * @param usdaAddress usda token address   
     */
    function redeemYields(
        address user,
        uint128 aBondAmount,
        address usdaAddress,
        address abondAddress,
        address treasuryAddress
    ) public returns(uint256){
        // check abond amount is non zewro
        require(aBondAmount > 0,"Abond amount should not be zero");
        IABONDToken abond = IABONDToken(abondAddress);
        // get user abond state
        State memory userState = abond.userStates(user);
        // check user have enough abond
        require(aBondAmount <= userState.aBondBalance,"You don't have enough aBonds");

        ITreasury treasury = ITreasury(treasuryAddress);
        // calculate abond usda ratio
        uint128 usdaToAbondRatio = uint128(treasury.abondUSDaPool() * RATE_PRECISION/ abond.totalSupply());
        uint256 usdaToBurn = (usdaToAbondRatio * aBondAmount) / RATE_PRECISION;
        // update abondUsdaPool in treasury
        treasury.updateAbondUSDaPool(usdaToBurn,false);

        // calculate abond usda ratio from liquidation
        uint128 usdaToAbondRatioLiq = uint128(treasury.usdaGainedFromLiquidation() * RATE_PRECISION/ abond.totalSupply());
        uint256 usdaToTransfer = (usdaToAbondRatioLiq * aBondAmount) / RATE_PRECISION;
        //update usdaGainedFromLiquidation in treasury
        treasury.updateUSDaGainedFromLiquidation(usdaToTransfer,false);

        //Burn the usda from treasury
        treasury.approveTokens(IBorrowing.AssetName.USDa, address(this),(usdaToBurn + usdaToTransfer));

        IUSDa usda = IUSDa(usdaAddress);
        // burn the usda 
        bool burned = usda.burnFromUser(address(treasury),usdaToBurn);
        if(!burned){
            revert ('Borrowing_RedeemBurnFailed');
        }
        
        if(usdaToTransfer > 0){
            // transfer usda to user
            bool transferred = usda.transferFrom(address(treasury),user,usdaToTransfer);
            if(!transferred){
                revert ('Borrowing_RedeemTransferFailed');
            }
        }
        // withdraw eth from ext protocol
        uint256 withdrawAmount = treasury.withdrawFromExternalProtocol(user,aBondAmount);

        //Burn the abond from user
        bool success = abond.burnFromUser(msg.sender,aBondAmount);
        if(!success){
            revert ('Borrowing_RedeemBurnFailed');
        }
        return withdrawAmount;
    }

    function _rpow(uint x, uint n, uint b) public pure returns (uint z) {
      assembly {
        switch x case 0 {switch n case 0 {z := b} default {z := 0}}
        default {
          switch mod(n, 2) case 0 { z := b } default { z := x }
          let half := div(b, 2)  // for rounding.
          for { n := div(n, 2) } n { n := div(n,2) } {
            let xx := mul(x, x)
            if iszero(eq(div(xx, x), x)) { revert(0,0) }
            let xxRound := add(xx, half)
            if lt(xxRound, xx) { revert(0,0) }
            x := div(xxRound, b)
            if mod(n,2) {
              let zx := mul(z, x)
              if and(iszero(iszero(x)), iszero(eq(div(zx, x), z))) { revert(0,0) }
              let zxRound := add(zx, half)
              if lt(zxRound, zx) { revert(0,0) }
              z := div(zxRound, b)
            }
          }
        }
      }
    }
}
