// SPDX-License-Identifier: MIT
// solhint-disable-next-line
pragma solidity ^0.8.15;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/* solhint-disable */
contract USDCTokenMock is ERC20 {
    constructor() ERC20("USDC mock", "USDC") {
    }

    function mint(address _address, uint256 _amount) public {
        _mint(_address, _amount);
    }

    function burn(address _address, uint256 _amount) public {
        _burn(_address, _amount);
    }
}

/* solhint-enable */