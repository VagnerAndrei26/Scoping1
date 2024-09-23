// SPDX-License-Identifier: MIT
// solhint-disable-next-line
pragma solidity ^0.8.15;

import "./ILendingPoolV2.sol";
import "../../StrategBlock.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "hardhat/console.sol";

/* solhint-disable */
contract StrategBlockAaveDepositMock is StrategBlock {

    struct Parameters {
        address lendingPool;
        uint256 tokenInPercent;
        address token;
        address aToken;
    }

    constructor() {
    }

    function enter(bytes calldata _parameters) external {
        Parameters memory parameters = abi.decode(_parameters, (Parameters));
        uint256 amountToDeposit = IERC20(parameters.token).balanceOf(address(this)) * parameters.tokenInPercent / 100;


        IERC20(parameters.token).approve(address(parameters.lendingPool), amountToDeposit);
        ILendingPool(parameters.lendingPool).deposit(
            parameters.token,
            amountToDeposit,
            address(this),
            0
        );
    }

    function exit(bytes calldata _parameters) external {
        Parameters memory parameters = abi.decode(_parameters, (Parameters));

        uint256 amountToWithdraw = IERC20(parameters.aToken).balanceOf(address(this));

        IERC20(parameters.aToken).approve(address(parameters.lendingPool), amountToWithdraw);
        ILendingPool(parameters.lendingPool).withdraw(
            parameters.token,
            amountToWithdraw,
            address(this)
        );
    }
    
    function oracleEnter(IStrategBlock.OracleResponse memory _before, bytes memory _parameters) external view returns (OracleResponse memory) {
        Parameters memory parameters = abi.decode(_parameters, (Parameters));
        IStrategBlock.OracleResponse memory before = _before;
        uint256 amountToDeposit = _findTokenAmount(parameters.token, before) * parameters.tokenInPercent / 100;

        if(amountToDeposit == 0) {
            amountToDeposit = IERC20(parameters.token).balanceOf(before.vault);
            before = _addTokenAmount(parameters.token, amountToDeposit, before);
        }

        IStrategBlock.OracleResponse memory _after = _removeTokenAmount(parameters.token, amountToDeposit, before);
        _after = _addTokenAmount(parameters.aToken, amountToDeposit, _after);
        
        return _after;
    }
    
    function oracleExit(IStrategBlock.OracleResponse memory _before, bytes memory _parameters) external view returns (OracleResponse memory) {
        Parameters memory parameters = abi.decode(_parameters, (Parameters));
        IStrategBlock.OracleResponse memory before = _before;
        uint256 amountToWithdraw = _findTokenAmount(parameters.aToken, before);

        if(amountToWithdraw == 0) {
            amountToWithdraw = IERC20(parameters.aToken).balanceOf(msg.sender);
            before = _addTokenAmount(parameters.aToken, amountToWithdraw, before);
        }

        IStrategBlock.OracleResponse memory _after = _removeTokenAmount(parameters.aToken, amountToWithdraw, before);
        _after = _addTokenAmount(parameters.token, amountToWithdraw, _after);
        
        return _after;
    }
}

