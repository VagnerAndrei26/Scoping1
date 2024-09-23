// SPDX-License-Identifier: MIT
// solhint-disable-next-line
pragma solidity ^0.8.15;


import "./aUSDCMock.sol";
import "../USDCTokenMock.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "hardhat/console.sol";

/* solhint-disable */
contract AaveMock {


    mapping(address => address) private aToken;

    event Deposit(address indexed tokenIn, address indexed tokenOut, uint256 tokenInAmount, uint256 tokenOutAmount);
    event Withdraw(address indexed tokenIn, address indexed tokenOut, uint256 tokenInAmount, uint256 tokenOutAmount);

    constructor() {
    }

    function setAToken(address _token, address _aToken) external {
        aToken[_token] = _aToken;
    }

    function deposit(
        address asset,
        uint256 amount,
        address,
        uint16
    ) external {
        console.log("Enter in Aave deposit");
        console.log(" asset: %s", asset);
        console.log(" amount: %s", amount);

        USDCTokenMock(asset).burn(msg.sender, amount);

        console.log(" mint");
        aUSDCMock(aToken[asset]).mint(msg.sender, amount);
        
        console.log(" event");
        emit Deposit(asset, aToken[asset], amount, amount);
        console.log(" end Aave deposit");
    }

    function withdraw(
        address asset,
        uint256 amount,
        address to
    ) external returns (uint256) {
        

        console.log("Enter in Aave withdraw");
        console.log(" asset: %s", asset);
        console.log(" amount: %s", amount);
        console.log(" to: %s", to);
        

        aUSDCMock(aToken[asset]).burn(msg.sender, amount);

        console.log("mint");
        USDCTokenMock(asset).mint(to, amount);

        console.log("event");
        emit Withdraw(aToken[asset], asset, amount, amount);
        console.log(" end Aave withdraw");
        return amount;
    }
}

/* solhint-enable */