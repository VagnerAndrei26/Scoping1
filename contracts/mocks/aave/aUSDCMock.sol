// SPDX-License-Identifier: MIT
// solhint-disable-next-line
pragma solidity ^0.8.10;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/* solhint-disable */
contract aUSDCMock is ERC20 {
    constructor() ERC20("Aave USDC Token mock", "aUSDC") {
    }

    function mint(address _address, uint256 _amount) public {
        _mint(_address, _amount);
    }

    function burn(address _address, uint256 _amount) public {
        _burn(_address, _amount);
    }
}

/* solhint-enable */