// SPDX-License-Identifier: unlicensed
pragma solidity 0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PausableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { OFT } from "@layerzerolabs/lz-evm-oapp-v2/contracts/oft/OFT.sol";

contract RSETH is Initializable, OFT, UUPSUpgradeable, ERC20BurnableUpgradeable {

    function initialize(
        address _lzEndpoint,
        address _delegate
    ) initializer public {
        __OFT_init("RS ETH","rsETH",_lzEndpoint, _delegate);
        __ERC20Burnable_init();
        __UUPSUpgradeable_init();
        __Ownable_init(msg.sender);
    }

    function _authorizeUpgrade(address newImplementation) internal onlyOwner override{}

    function mint(address to, uint256 amount) public returns(bool){
        _mint(to, amount);
        return true;
    }
    function burnFromUser(address to, uint256 amount) public returns(bool){
        burnFrom(to, amount);
        return true;
    }

    function _update(address from, address to, uint256 value)
        internal
        override
    {
        super._update(from, to, value);
    }
}