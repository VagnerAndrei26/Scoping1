// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;
import { ERC20 } from '@openzeppelin/contracts/token/ERC20/ERC20.sol';

interface EtherFiLiquidNew {    
       
    function deposit(ERC20 depositAsset, uint256 depositAmount, uint256 minimumMint) external payable returns (uint256 shares);
}