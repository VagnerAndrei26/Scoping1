// SPDX-License-Identifier: LZBL-1.1
// Copyright 2023 LayerZero Labs Ltd.
// You may obtain a copy of the License at
// https://github.com/LayerZero-Labs/license/blob/main/LICENSE-LZBL-1.1

pragma solidity 0.8.20;

import "../interface/ITreasury.sol";
import "../interface/IUSDa.sol";
import "../interface/IBorrowing.sol";
import "../interface/CDSInterface.sol";
import "../interface/IGlobalVariables.sol";
import "hardhat/console.sol";


library CDSLib {

    uint128 constant PRECISION = 1e12;
    uint128 constant RATIO_PRECISION = 1e4;

    /**
     * @dev calculates the cumulative value
     * @param _price eth price
     * @param totalCdsDepositedAmount total cds deposited amount
     * @param lastEthPrice last recorded eth price
     * @param fallbackEthPrice second last recorded eth price
     * @param vaultBal treasury vault balance
     */
    function calculateValue(
        uint128 _price,
        uint256 totalCdsDepositedAmount,
        uint128 lastEthPrice,
        uint128 fallbackEthPrice,
        uint256  vaultBal
    ) public pure returns(CDSInterface.CalculateValueResult memory) {
        uint128 _amount = 1000;
        uint128 priceDiff;
        uint128 value;
        bool gains;
        // if total cds deposited amount is zero
        if(totalCdsDepositedAmount == 0){
            value = 0;
            gains = true;
        }else{
            if(_price != lastEthPrice){
                // If the current eth price is higher than last eth price,then it is gains
                if(_price > lastEthPrice){
                    priceDiff = _price - lastEthPrice;
                    gains = true;    
                }else{
                    priceDiff = lastEthPrice - _price;
                    gains = false;
                }
            }
            else{
                // If the current eth price is higher than fallback eth price,then it is gains
                if(_price > fallbackEthPrice){
                    priceDiff = _price - fallbackEthPrice;
                    gains = true;   
                }else{
                    priceDiff = fallbackEthPrice - _price;
                    gains = false;
                }
            }

            value = uint128((_amount * vaultBal * priceDiff * 1e6) / (PRECISION * totalCdsDepositedAmount));
        }
        return CDSInterface.CalculateValueResult(value,gains);
    }

    /**
     * @dev get the options fees proportions
     * @param optionsFees optionsFees
     * @param _totalCdsDepositedAmount cds amount in this chain
     * @param _totalGlobalCdsDepositedAmount cds amount in global
     * @param _totalCdsDepositedAmountWithOptionFees cds amount with options fees in this chain
     * @param _totalGlobalCdsDepositedAmountWithOptionFees cds amount with options fees in global
     */
    function getOptionsFeesProportions(
        uint256 optionsFees,
        uint256 _totalCdsDepositedAmount,
        uint256 _totalGlobalCdsDepositedAmount,
        uint256 _totalCdsDepositedAmountWithOptionFees,
        uint256 _totalGlobalCdsDepositedAmountWithOptionFees
    ) public pure returns (uint256){
        // calculate other chain cds amount
        uint256 otherChainCDSAmount = _totalGlobalCdsDepositedAmount - _totalCdsDepositedAmount;
        // calculate option fees in otherchain
        uint256 totalOptionFeesInOtherChain = _totalGlobalCdsDepositedAmountWithOptionFees
                - _totalCdsDepositedAmountWithOptionFees - otherChainCDSAmount;
        // calculate options fees in this chain
        uint256 totalOptionFeesInThisChain = _totalCdsDepositedAmountWithOptionFees - _totalCdsDepositedAmount; 
        // calculate share of both chains
        uint256 share = (otherChainCDSAmount * 1e10)/_totalGlobalCdsDepositedAmount;
        // options fees to get from other chain
        uint256 optionsfeesToGet = (optionsFees * share)/1e10;
        // options fees to get from this chain
        uint256 optionsFeesRemaining = optionsFees - optionsfeesToGet;

        // if the options fees in other chain is zero
        if(totalOptionFeesInOtherChain == 0){
            // options fees to get from otherchain is zero
            optionsfeesToGet = 0;
        }else{
            // if the options fees in other chain is insufficient
            // take the remaining from this chain
            if(totalOptionFeesInOtherChain < optionsfeesToGet) {
                optionsfeesToGet = totalOptionFeesInOtherChain;
            }else{
                if(totalOptionFeesInOtherChain > optionsfeesToGet && totalOptionFeesInThisChain < optionsFeesRemaining){
                    optionsfeesToGet += optionsFeesRemaining - totalOptionFeesInThisChain;
                }else{
                    optionsfeesToGet = optionsfeesToGet;
                }
            }
        }
        return optionsfeesToGet;
    }

    /**
     * @dev sets cumulative value
     * @param _value value to add
     * @param _gains eth price change gains
     * @param _cumulativeValueSign boolean tells, whether the cumlative value is positive or negative
     * @param _cumulativeValue cumulative value
     */
    function setCumulativeValue(
        uint128 _value,
        bool _gains,
        bool _cumulativeValueSign,
        uint128 _cumulativeValue) public pure returns(bool,uint128){
        if(_gains){
            // If the cumulativeValue is positive
            if(_cumulativeValueSign){
                // Add value to cumulativeValue
                _cumulativeValue += _value;
            }else{
                // if the cumulative value is greater than value 
                if(_cumulativeValue > _value){
                    // Remains in negative
                    _cumulativeValue -= _value;
                }else{
                    // Going to postive since value is higher than cumulative value
                    _cumulativeValue = _value - _cumulativeValue;
                    _cumulativeValueSign = true;
                }
            }
        }else{
            // If cumulative value is in positive
            if(_cumulativeValueSign){
                if(_cumulativeValue > _value){
                    // Cumulative value remains in positive
                    _cumulativeValue -= _value;
                }else{
                    // Going to negative since value is higher than cumulative value
                    _cumulativeValue = _value - _cumulativeValue;
                    _cumulativeValueSign = false;
                }
            }else{
                // Cumulative value is in negative
                _cumulativeValue += _value;
            }
        }

        return (_cumulativeValueSign, _cumulativeValue);
    }

    /**
     * @dev calculates the cumulative rate
     * @param _fees options fees
     * @param _totalCdsDepositedAmount cds deposited amount
     * @param _totalCdsDepositedAmountWithOptionFees cds deposited amount with options fees
     * @param _totalGlobalCdsDepositedAmountWithOptionFees global cds depsoited amount with options fees
     * @param _lastCumulativeRate last cumulative rate
     * @param _noOfBorrowers number of borrowers
     */
    function calculateCumulativeRate(
        uint128 _fees,
        uint256 _totalCdsDepositedAmount,
        uint256 _totalCdsDepositedAmountWithOptionFees,
        uint256 _totalGlobalCdsDepositedAmountWithOptionFees,
        uint128 _lastCumulativeRate,
        uint128 _noOfBorrowers
    ) public pure returns(uint256,uint256,uint128){
        // check the fees is non zero
        require(_fees != 0,"Fees should not be zero");
        // if there is some deposits in cds then only increment fees
        if(_totalCdsDepositedAmount > 0){
            _totalCdsDepositedAmountWithOptionFees += _fees;
        }
        _totalGlobalCdsDepositedAmountWithOptionFees += _fees;
        uint128 netCDSPoolValue = uint128(_totalGlobalCdsDepositedAmountWithOptionFees);
        // Calculate percentage change
        uint128 percentageChange = (_fees * PRECISION)/netCDSPoolValue;
        uint128 currentCumulativeRate;
        // If there is no borrowers
        if(_noOfBorrowers == 0){
            currentCumulativeRate = (1 * PRECISION) + percentageChange;
            _lastCumulativeRate = currentCumulativeRate;
        }else{
            currentCumulativeRate = _lastCumulativeRate * ((1 * PRECISION) + percentageChange);
            _lastCumulativeRate = (currentCumulativeRate/PRECISION);
        }

        return (_totalCdsDepositedAmountWithOptionFees,_totalGlobalCdsDepositedAmountWithOptionFees,_lastCumulativeRate);
    }

    /**
     * @dev calcultes user proportion in withraw
     * @param depositedAmount deposited amount
     * @param returnAmount withdraw amount
     */
    function calculateUserProportionInWithdraw(uint256 depositedAmount, uint256 returnAmount) public pure returns(uint128){
        uint256 toUser;
        // if the return amount is greater than depsoited amount,
        // deduct 10% from it
        if(returnAmount > depositedAmount){
            uint256 profit = returnAmount - depositedAmount;
            toUser = (profit * 90) / 100;
        }else{
            toUser = returnAmount;
        }

        return uint128(toUser);
    }

    /**
     * @dev calculates cds amount to return based on price change gain or loss
     * @param depositData struct contains deposit user data
     * @param result struct containing, calculate value result
     * @param currentCumulativeValue current cumulative value
     * @param currentCumulativeValueSign current cumulative value sign
     */
    function cdsAmountToReturn(
        CDSInterface.CdsAccountDetails memory depositData,
        CDSInterface.CalculateValueResult memory result,
        uint128 currentCumulativeValue,
        bool currentCumulativeValueSign
    ) public pure returns(uint256){

        // set the cumulative value
        (bool cumulativeValueSign, uint128 cumulativeValue) = setCumulativeValue(
            result.currentValue,
            result.gains,
            currentCumulativeValueSign,
            currentCumulativeValue);
        uint256 depositedAmount = depositData.depositedAmount;
        uint128 cumulativeValueAtDeposit = depositData.depositValue;
        // Get the cumulative value sign at the time of deposit
        bool cumulativeValueSignAtDeposit = depositData.depositValueSign;
        uint128 valDiff;
        uint128 cumulativeValueAtWithdraw = cumulativeValue;

        // If the depositVal and cumulativeValue both are in same sign
        if(cumulativeValueSignAtDeposit == cumulativeValueSign){
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
                    uint256 profit = (depositedAmount * valDiff)/1e11;
                    return (depositedAmount + profit);
                }else{
                    uint256 loss = (depositedAmount * valDiff) / 1e11;
                    return (depositedAmount - loss);
                }
            }
        }else{
            valDiff = cumulativeValueAtDeposit + cumulativeValueAtWithdraw;
            if(cumulativeValueSignAtDeposit){
                uint256 loss = (depositedAmount * valDiff) / 1e11;
                return (depositedAmount - loss);
            }else{
                uint256 profit = (depositedAmount * valDiff)/1e11;
                return (depositedAmount + profit);            
            }
        }
    }

    /**
     * @dev get user share
     * @param amount amount in wei
     * @param share share in percentage with 1e10 precision
     */
    function getUserShare(uint128 amount, uint128 share) public pure returns(uint128){
        return (amount * share)/1e10;
    }

    /**
     * @dev gets the lz fucntions to do in dst chain
     * @param optionsFeesToGetFromOtherChain options Fees To Get From OtherChain
     * @param collateralToGetFromOtherChain collateral To Get From OtherChain
     */
    function getLzFunctionToDo(
        uint256 optionsFeesToGetFromOtherChain,
        uint256 collateralToGetFromOtherChain) public pure returns(uint8 functionToDo){
        //Based on non zero value, the function to do is defined,
        // FunctionToDo enum is defined in the interface 
        if(optionsFeesToGetFromOtherChain > 0 && collateralToGetFromOtherChain == 0){
            functionToDo = 3;

        }else if(optionsFeesToGetFromOtherChain == 0 && collateralToGetFromOtherChain > 0){
            functionToDo = 4;

        }else if(optionsFeesToGetFromOtherChain > 0 && collateralToGetFromOtherChain > 0){
            functionToDo = 5;

        }
    }

    /**
     * @dev Returns the which type of collateral to give to user which is accured during liquidation
     * @param param struct contains, param
     */
    function getLiquidatedCollateralToGive(
        CDSInterface.GetLiquidatedCollateralToGiveParam memory param
    ) public pure returns (uint128,uint128,uint128,uint128,uint128){

        // calculate the amount needed in eth value
        uint256 totalAmountNeededInETH = param.ethAmountNeeded + (
            param.weETHAmountNeeded * param.weETHExRate)/1 ether + (param.rsETHAmountNeeded * param.rsETHExRate)/1 ether;
        // calculate amount needed in weeth value
        uint256 totalAmountNeededInWeETH = (totalAmountNeededInETH * 1 ether)/ param.weETHExRate;
        // calculate amount needed in rseth value
        uint256 totalAmountNeededInRsETH = (totalAmountNeededInETH * 1 ether) / param.rsETHExRate;
 
        uint256 liquidatedCollateralToGiveInETH;
        uint256 liquidatedCollateralToGiveInWeETH;
        uint256 liquidatedCollateralToGiveInRsETH;
        uint256 liquidatedCollateralToGetFromOtherChainInETHValue;
        // If this chain has sufficient amount
        if(param.totalCollateralAvailableInETHValue >= totalAmountNeededInETH){
            // If total amount is avaialble in eth itself
            if(param.ethAvailable >= totalAmountNeededInETH){
                liquidatedCollateralToGiveInETH = totalAmountNeededInETH;
            // If total amount is avaialble in weeth itself
            }else if(param.weETHAvailable >= totalAmountNeededInWeETH){
                liquidatedCollateralToGiveInWeETH = totalAmountNeededInWeETH;
            // If total amount is avaialble in rseth itself
            }else if(param.rsETHAvailable >= totalAmountNeededInRsETH){
                liquidatedCollateralToGiveInRsETH = totalAmountNeededInRsETH;

            }else{
                // else, get the available amount in each
                liquidatedCollateralToGiveInETH = param.ethAvailable;
                liquidatedCollateralToGiveInWeETH = ((totalAmountNeededInETH - liquidatedCollateralToGiveInETH) * 1 ether)/ param.weETHExRate;
                if(param.weETHAvailable < liquidatedCollateralToGiveInWeETH){
                    liquidatedCollateralToGiveInWeETH = param.weETHAvailable;
                    liquidatedCollateralToGiveInRsETH = (
                        (totalAmountNeededInETH - liquidatedCollateralToGiveInETH - (liquidatedCollateralToGiveInWeETH * param.weETHExRate)/1 ether
                        ) * 1 ether
                    )/param.rsETHExRate;   
                }
            }

        }else{

            liquidatedCollateralToGiveInETH = param.ethAvailable;
            liquidatedCollateralToGiveInWeETH = param.weETHAvailable;
            liquidatedCollateralToGiveInRsETH = param.rsETHAvailable;

            liquidatedCollateralToGetFromOtherChainInETHValue = totalAmountNeededInETH - param.totalCollateralAvailableInETHValue;

        }
        return (
            uint128(totalAmountNeededInETH),
            uint128(liquidatedCollateralToGiveInETH),
            uint128(liquidatedCollateralToGiveInWeETH),
            uint128(liquidatedCollateralToGiveInRsETH),
            uint128(liquidatedCollateralToGetFromOtherChainInETHValue));
    }

}