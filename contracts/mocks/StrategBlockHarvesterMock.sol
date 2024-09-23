// SPDX-License-Identifier: MIT
// solhint-disable-next-line
pragma solidity ^0.8.15;

import "../interfaces/IStrategBlock.sol";
import "./aave/aUSDCMock.sol";
import "./USDCTokenMock.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";


/* solhint-disable */
contract StrategBlockHarvesterMock is IStrategBlock {

    struct Parameters {
        address token;
        uint256 amount;
        address dest;
    }

    constructor() {
    }

    function enter(bytes calldata _parameters) external {
        Parameters memory parameters = abi.decode(_parameters, (Parameters));

        USDCTokenMock(parameters.token).mint(parameters.dest, parameters.amount);
    }

    function exit(bytes calldata _parameters) external {
    }
    
    function oracleEnter(IStrategBlock.OracleResponse memory _before, bytes memory _parameters) external view returns (OracleResponse memory) {
        Parameters memory parameters = abi.decode(_parameters, (Parameters));
        IStrategBlock.OracleResponse memory _after = _addTokenAmount(parameters.token, parameters.amount, _before);
        return _after;
    }
    
    function oracleExit(IStrategBlock.OracleResponse memory _before, bytes memory _parameters) external view returns (OracleResponse memory) {
    }

    function _findTokenAmount(address _token, OracleResponse memory _res) internal pure returns (uint256) {
        for (uint i = 0; i < _res.tokens.length; i++) {
            if(_res.tokens[i] == _token) {
                return _res.tokensAmount[i];
            }
        }
        return 0;
    }

    function _addTokenAmount(address _token, uint256 _amount, OracleResponse memory _res) internal pure returns (IStrategBlock.OracleResponse memory) {
        for (uint i = 0; i < _res.tokens.length; i++) {
            if(_res.tokens[i] == _token) {
                _res.tokensAmount[i] += _amount;
                return _res;
            }
        }

        address[] memory newTokens = new address[](_res.tokens.length + 1);
        uint256[] memory newTokensAmount = new uint256[](_res.tokens.length + 1);

        for (uint i = 0; i < _res.tokens.length; i++) {
            newTokens[i] = _res.tokens[i];
            newTokensAmount[i] = _res.tokensAmount[i];
        }

        newTokens[_res.tokens.length] = _token;
        newTokensAmount[_res.tokens.length] = _amount;

        _res.tokens = newTokens;
        _res.tokensAmount = newTokensAmount;
        return _res;
    }

    function _removeTokenAmount(address _token, uint256 _amount, OracleResponse memory _res) internal pure returns (IStrategBlock.OracleResponse memory) {
        for (uint i = 0; i < _res.tokens.length; i++) {
            if(_res.tokens[i] == _token) {
                _res.tokensAmount[i] -= _amount;
                return _res;
            }
        }

        return _res;
    }
}

/* solhint-enable */