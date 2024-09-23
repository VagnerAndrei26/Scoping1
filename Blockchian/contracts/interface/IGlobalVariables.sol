// SPDX-License-Identifier: unlicensed

pragma solidity 0.8.20;

import { MessagingReceipt, MessagingFee } from "@layerzerolabs/lz-evm-oapp-v2/contracts/oft/interfaces/IOFT.sol";
import "./CDSInterface.sol";
import "./IBorrowing.sol";

interface IGlobalVariables{

    struct OmniChainData {
        uint256  normalizedAmount;
        uint256  vaultValue;
        uint256  cdsPoolValue;
        uint256  totalCDSPool;
        uint256  collateralRemainingInWithdraw;
        uint256  collateralValueRemainingInWithdraw;
        uint128  noOfLiquidations;
        uint64   nonce;

        uint64  cdsCount;
        uint256 totalCdsDepositedAmount;
        uint256 totalCdsDepositedAmountWithOptionFees;
        uint256 totalAvailableLiquidationAmount;
        uint256 usdtAmountDepositedTillNow;
        uint256 burnedUSDaInRedeem;
        uint128 lastCumulativeRate;

        uint256  totalVolumeOfBorrowersAmountinWei;
        uint256  totalVolumeOfBorrowersAmountinUSD;
        uint128  noOfBorrowers;
        uint256  totalInterest;
        uint256  abondUSDaPool;
        uint256  collateralProfitsOfLiquidators;
        uint256  usdaGainedFromLiquidation;
        uint256  totalInterestFromLiquidation;
        uint256  interestFromExternalProtocolDuringLiquidation;
        uint256  totalNoOfDepositIndices;
        uint256  totalVolumeOfBorrowersAmountLiquidatedInWei;
    }

    struct CollateralData {
        uint256 noOfIndices;
        uint256 totalDepositedAmount;
        uint256 totalDepositedAmountInETH;
        uint256 totalLiquidatedAmount;
    }

    struct USDaOftTransferData {
        address recipient;
        uint256 tokensToSend;
    }

    struct CollateralTokenTransferData{
        address recipient;
        uint256 ethToSend;
        uint256 weETHToSend;
        uint256 rsETHToSend;
    }

    enum FunctionToDo { DUMMY, UPDATE_GLOBAL, UPDATE_INDIVIDUAL , TOKEN_TRANSFER, COLLATERAL_TRANSFER, BOTH_TRANSFER}
    
    function getOmniChainData() external view returns(OmniChainData memory);

    function setOmniChainData(OmniChainData memory _omniChainData) external;
    function oftOrCollateralReceiveFromOtherChains(
        FunctionToDo functionToDo,
        USDaOftTransferData memory oftTransferData,
        CollateralTokenTransferData memory collateralTokenTransferData,
        address refundAddress
    ) external payable returns (MessagingReceipt memory receipt);

    function updateCollateralData(
        IBorrowing.AssetName assetName, 
        CollateralData memory collateralData
    ) external;

    function getOmniChainCollateralData(IBorrowing.AssetName assetName) external view returns(CollateralData memory);

    function quote(
        FunctionToDo functionToDo,
        IBorrowing.AssetName CollateralName,
        bytes memory options,
        bool payInLzToken
    ) external view returns(MessagingFee memory fee);

    function send(        
        FunctionToDo functionToDo,
        IBorrowing.AssetName assetName,
        MessagingFee memory fee,
        bytes memory options,
        address refundAddress
    ) external payable returns (MessagingReceipt memory receipt);

    function sendForLiquidation(        
        FunctionToDo functionToDo,
        uint128 liqIndex,
        CDSInterface.LiquidationInfo memory liquidationInfo,
        IBorrowing.AssetName assetName,
        MessagingFee memory fee,
        bytes memory options,
        address refundAddress
    ) external payable returns (MessagingReceipt memory receipt);
}