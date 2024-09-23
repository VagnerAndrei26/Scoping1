/**
 * SPDX-License-Identifier: Proprietary
 * 
 * Strateg Protocol contract
 * PROPRIETARY SOFTWARE AND LICENSE. 
 * This contract is the valuable and proprietary property of Strateg Development Association. 
 * Strateg Development Association shall retain exclusive title to this property, and all modifications, 
 * implementations, derivative works, upgrades, productizations and subsequent releases. 
 * To the extent that developers in any way contributes to the further development of Strateg protocol contracts, 
 * developers hereby irrevocably assign and/or agrees to assign all rights in any such contributions or further developments to Strateg Development Association. 
 * Without limitation, Strateg Development Association acknowledges and agrees that all patent rights, 
 * copyrights in and to the Strateg protocol contracts shall remain the exclusive property of Strateg Development Association at all times.
 * 
 * DEVELOPERS SHALL NOT, IN WHOLE OR IN PART, AT ANY TIME: 
 * (i) SELL, ASSIGN, LEASE, DISTRIBUTE, OR OTHER WISE TRANSFER THE STRATEG PROTOCOL CONTRACTS TO ANY THIRD PARTY; 
 * (ii) COPY OR REPRODUCE THE STRATEG PROTOCOL CONTRACTS IN ANY MANNER;
 */
pragma solidity ^0.8.15;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

contract StrategBlockRegistry is Ownable {

    uint256 public blocksLength;
    mapping(uint256 => address) public blocks; 

    event NewBlock(uint256 indexed block, address addr);

    constructor(address[] memory _initialBlocks) {
        for (uint i = 0; i < _initialBlocks.length; i++) {
            blocks[i] = _initialBlocks[i];
        }

        blocksLength = _initialBlocks.length;
    }

    function addBlocks(address[] memory _blocks) external onlyOwner {
        for (uint i = 0; i < _blocks.length; i++) {
            blocks[blocksLength + i] = _blocks[i];
            emit NewBlock(blocksLength + i, _blocks[i]);
        }

        blocksLength = blocksLength + _blocks.length;
    }

    function getBlocks(uint256[] memory _blocks) external view returns (address[] memory) {
        address[] memory addresses = new address[](_blocks.length);

        for (uint i = 0; i < _blocks.length; i++) {
            addresses[i] = blocks[_blocks[i]];
            if(addresses[i] == address(0)) {
                revert(string.concat(Strings.toString(_blocks[i]), " step unknown"));
            }
        }

        return addresses;
    }
}
