// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IStrategyBlockRegistry {
    function addBlocks(address[] memory _blocks) external;
    function getBlocks(uint256[] memory _blocks) external view returns (address[] memory);

    function blocksLength() external view returns (uint256);
    function blocks(uint256 index) external view returns (address);
}