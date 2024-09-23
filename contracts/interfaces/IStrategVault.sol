// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

import "./IStrategBlockRegistry.sol";
import "./IStrategBlock.sol";

// import "hardhat/console.sol";

interface IStrategVault {

    function transferFrom(address from, address to, uint256 amount) external;

    function setStrat(
        uint256[] memory _stratBlocksIndex,
        bytes[] memory _stratBlocksParameters,
        uint256[] memory _harvestBlocksIndex,
        bytes[] memory _harvestBlocksParameters,
        uint256[] memory _oracleBlocksIndex,
        bytes[] memory _oracleBlocksParameters
    ) external;

    function getStrat()
        external
        view
        returns (
            address[] memory _stratBlocks,
            bytes[] memory _stratBlocksParameters,
            address[] memory _harvestBlocks,
            bytes[] memory _harvestBlocksParameters,
            address[] memory _oracleBlocks,
            bytes[] memory _oracleBlocksParameters
        );

    function registry() external view  returns (address);
    function feeCollector() external view  returns (address);
    function factory() external view  returns (address);
    function totalAssets() external view  returns (uint256);
    function asset() external view  returns (address);

    function harvest() external;

    /** @dev See {IERC4262-deposit}. */
    function deposit(uint256 assets, address receiver)
        external
        returns (uint256);

    /** @dev See {IERC4262-mint}. */
    function mint(uint256 shares, address receiver)
        external
        returns (uint256);

    /** @dev See {IERC4262-withdraw}. */
    function withdraw(
        uint256 assets,
        address receiver,
        address owner
    ) external returns (uint256);

    /** @dev See {IERC4262-redeem}. */
    function redeem(
        uint256 shares,
        address receiver,
        address owner
    ) external returns (uint256);

    function permit(
        address owner,
        address spender,
        uint256 amount,
        uint256 deadline,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    )  external;
}
