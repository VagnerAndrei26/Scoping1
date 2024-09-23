// SPDX-License-Identifier: unlicensed
pragma solidity 0.8.20;

import { MessagingReceipt, MessagingFee } from "@layerzerolabs/lz-evm-oapp-v2/contracts/oft/interfaces/IOFT.sol";
import { IBorrowing } from "../interface/IBorrowing.sol";
import { IGlobalVariables } from "../interface/IGlobalVariables.sol";

interface CDSInterface {

    // CDS user individual deposit details
    struct CdsAccountDetails {
        uint64 depositedTime;// deposited time
        uint256 depositedAmount;// total deposited amount
        uint64 withdrawedTime;// withdraw time
        uint256 withdrawedAmount;// total withdraw usda amount
        bool withdrawed;// whether the user has withdrew or not
        uint128 depositPrice;// deposit eth price 
        uint128 depositValue;// cumulative value at deposit
        bool depositValueSign;// cumulative value sign at deposit
        bool optedLiquidation;// whether the user has opted for liq gains or not
        uint128 InitialLiquidationAmount;// amount opted by user to be used for liquidation
        uint128 liquidationAmount;// updated available liquidation amount after every liquidation
        uint128 liquidationindex;// liquidation index at deposit
        uint256 normalizedAmount;// normalized amount
        uint128 lockingPeriod;// locking period chose by user
        uint128 depositedUSDa;// deposited usda
        uint128 depositedUSDT;// deposited usdt
        uint128 withdrawCollateralAmount;// withdraw liquidated collateral amount
        uint128 ethPriceAtWithdraw;// eth price during withdraw
        uint256 optionFees;// option fees gained by user
        uint256 optionFeesWithdrawn;// options fees withdrew by user
    }

    // CDS user detail
    struct CdsDetails {
        uint64 index;// total index the user has
        bool hasDeposited;// whether the user has deposited or not
        mapping ( uint64 => CdsAccountDetails) cdsAccountDetails;// cds deposit details mapped to each index
    }
    
    // calculate value function return struct
    struct CalculateValueResult{
        uint128 currentValue;
        bool gains;
    }

    // Liquidation info to store
    struct LiquidationInfo{
        uint128 liquidationAmount;// liqudation amount needed
        uint128 profits;// profits gained in the liquidation
        uint128 collateralAmount;// collateral amount liquidated
        uint256 availableLiquidationAmount;// total available liquidation amount during the liquidation
        IBorrowing.AssetName assetName;// collateral type liquidated
        uint128 collateralAmountInETHValue;// liquidated collateral in eth value
    }

    // Liquidated collateral to give
    struct GetLiquidatedCollateralToGiveParam {
        uint256 ethAmountNeeded;// collaterla amount needed in eth
        uint256 weETHAmountNeeded;// collateral amount needed in weeth
        uint256 rsETHAmountNeeded;// collateral amount needed in rseth
        uint256 ethAvailable;// eth available
        uint256 weETHAvailable;// weeth available
        uint256 rsETHAvailable;// rseth available
        uint256 totalCollateralAvailableInETHValue;// total available in eth value
        uint128 weETHExRate;// weeth/eth exchange rate
        uint128 rsETHExRate;// rseth/eth exchange rate
    }

    struct WithdrawUserWhoNotOptedForLiqGainsParams {
        CdsAccountDetails cdsDepositDetails;// deposit details
        IGlobalVariables.OmniChainData omniChainData;// global data
        uint256 optionFees;// optionsfees
        uint256 optionsFeesToGetFromOtherChain;// options fees to get from otherchain
        uint256 returnAmount;// return usda amount
        uint128 usdaToTransfer;// usda to transfer
        uint256 fee;// lz fee
    }

    struct WithdrawUserWhoOptedForLiqGainsParams {
        CdsAccountDetails cdsDepositDetails;// deposit details
        IGlobalVariables.OmniChainData omniChainData;// global data
        uint256 optionFees;// optionsfees
        uint256 optionsFeesToGetFromOtherChain;// options fees to get from otherchain
        uint256 returnAmount;// return usda amount
        uint128 ethAmount;// return eth transfer
        uint128 usdaToTransfer;// usda to transfer
        uint128 weETH_ExchangeRate;// weeth/eth exchange rate
        uint128 rsETH_ExchangeRate;// rseth/eth exchange rate
        uint256 fee;// lz fee
    }

    function totalCdsDepositedAmount() external view returns(uint256);
    function totalAvailableLiquidationAmount() external returns(uint256);

    function calculateCumulativeRate(uint128 fees) external returns(uint128);

    function getCDSDepositDetails(address depositor,uint64 index) external view returns(CdsAccountDetails memory,uint64);
    function updateTotalAvailableLiquidationAmount(uint256 amount) external;
    function updateLiquidationInfo(uint128 index,LiquidationInfo memory liquidationData) external;
    function updateTotalCdsDepositedAmount(uint128 _amount) external;
    function updateTotalCdsDepositedAmountWithOptionFees(uint128 _amount) external;

    
    event Deposit(
        address user,
        uint64 index,
        uint128 depositedUSDa,
        uint128 depositedUSDT,
        uint256 depositedTime,
        uint128 ethPriceAtDeposit,
        uint128 lockingPeriod,
        uint128 liquidationAmount,
        bool optedForLiquidation
    );
    event Withdraw(
        address user,
        uint64 index,
        uint256 withdrawUSDa,
        uint256 withdrawTime,
        uint128 withdrawETH,
        uint128 ethPriceAtWithdraw,
        uint256 optionsFees,
        uint256 optionsFeesWithdrawn
    );
}