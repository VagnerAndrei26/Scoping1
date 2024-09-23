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

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

import "./interfaces/IStrategBlockRegistry.sol";
import "./interfaces/IStrategBlock.sol";

import "hardhat/console.sol";

contract StrategVault is ERC20, ERC20Permit, ERC4626, Ownable {
    bool public initialized;
    address public registry;
    address public feeCollector;
    address public factory;
    uint256 private performanceFees;
    uint256 private lastFeeHarvestIndex;

    uint16 private stratBlocksLength;
    mapping(uint16 => address) private stratBlocks;
    mapping(uint16 => bytes) private stratBlocksParameters;

    uint16 private harvestBlocksLength;
    mapping(uint16 => address) private harvestBlocks;
    mapping(uint16 => bytes) private harvestBlocksParameters;

    uint16 private oracleBlocksLength;
    mapping(uint16 => address) private oracleBlocks;
    mapping(uint16 => bytes) private oracleBlocksParameters;

    /**
     * @dev Set the underlying asset contract. This must be an ERC20-compatible contract (ERC20 or ERC777).
     */
    constructor(
        address _feeCollector,
        address _registry,
        string memory _name,
        string memory _symbol,
        address asset,
        uint256 _performanceFees
    ) ERC20(_name, _symbol) ERC20Permit(_name) ERC4626(IERC20Metadata(asset)) {
        registry = _registry;
        performanceFees = _performanceFees; // 10000 = 100%
        feeCollector = _feeCollector;
        lastFeeHarvestIndex = 10000;
        factory = msg.sender;
    }

    function setStrat(
        uint256[] memory _stratBlocksIndex,
        bytes[] memory _stratBlocksParameters,
        uint256[] memory _harvestBlocksIndex,
        bytes[] memory _harvestBlocksParameters,
        uint256[] memory _oracleBlocksIndex,
        bytes[] memory _oracleBlocksParameters
    ) external onlyOwner {
        require(!initialized, 'initialized');
        // console.log("Entering in function");
        IStrategyBlockRegistry r = IStrategyBlockRegistry(registry);
        address[] memory _stratBlocks = r.getBlocks(_stratBlocksIndex);
        address[] memory _harvestBlocks = r.getBlocks(_harvestBlocksIndex);
        address[] memory _oracleBlocks = r.getBlocks(_oracleBlocksIndex);

        if (stratBlocksLength > 0) {
            // console.log("stratBlocksLength > 0");
            _harvestStrategy();
            _exitStrategy();
        }

        // console.log("setup strat Blocks");
        for (uint16 i = 0; i < _stratBlocks.length; i++) {
            stratBlocks[i] = _stratBlocks[i];
            stratBlocksParameters[i] = _stratBlocksParameters[i];
        }
        stratBlocksLength = uint16(_stratBlocks.length);

        // console.log("setup harvest Blocks");
        for (uint16 i = 0; i < _harvestBlocks.length; i++) {
            harvestBlocks[i] = _harvestBlocks[i];
            harvestBlocksParameters[i] = _harvestBlocksParameters[i];
        }
        harvestBlocksLength = uint16(_harvestBlocks.length);

        // console.log("setup oracle Blocks");
        for (uint16 i = 0; i < _oracleBlocks.length; i++) {
            oracleBlocks[i] = _oracleBlocks[i];
            oracleBlocksParameters[i] = _oracleBlocksParameters[i];
        }
        oracleBlocksLength = uint16(_oracleBlocks.length);

        initialized = true;
    }

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
        )
    {
        uint16 _stratBlocksLength = stratBlocksLength;
        uint16 _harvestBlocksLength = harvestBlocksLength;
        uint16 _oracleBlocksLength = oracleBlocksLength;

        _stratBlocks = new address[](_stratBlocksLength);
        _stratBlocksParameters = new bytes[](_stratBlocksLength);
        _harvestBlocks = new address[](_harvestBlocksLength);
        _harvestBlocksParameters = new bytes[](_harvestBlocksLength);
        _oracleBlocks = new address[](_oracleBlocksLength);
        _oracleBlocksParameters = new bytes[](_oracleBlocksLength);

        for (uint16 i = 0; i < _stratBlocksLength; i++) {
            _stratBlocks[i] = stratBlocks[i];
            _stratBlocksParameters[i] = stratBlocksParameters[i];
        }

        for (uint16 i = 0; i < _harvestBlocksLength; i++) {
            _harvestBlocks[i] = harvestBlocks[i];
            _harvestBlocksParameters[i] = harvestBlocksParameters[i];
        }

        for (uint16 i = 0; i < _oracleBlocksLength; i++) {
            _oracleBlocks[i] = oracleBlocks[i];
            _oracleBlocksParameters[i] = oracleBlocksParameters[i];
        }
    }

    // function emergencyExitStrategy() external onlyOwner {
    //     _harvestStrategy();
    //     _exitStrategy();
    //     for (uint16 i = 0; i < stratBlocksLength; i++) {
    //         stratBlocks[i] = stratBlocks[i];
    //     }
    //     _enterInStrategy();
    // }

    function _getNativeTVL() internal view returns (uint256) {
        console.log("___________________________");
        console.log("Entering in _getNativeTVL()");
        uint256 tvl = 0;
        address _asset = asset();

        IStrategBlock.OracleResponse memory _tmp;
        _tmp.vault = address(this);

        console.log("Chaining oracle response");

        if (oracleBlocksLength == 0) {
            return IERC20(_asset).balanceOf(address(this));
        } else if (oracleBlocksLength == 1) {
            console.log("Only one oracle Block to check");
            _tmp = IStrategBlock(oracleBlocks[0]).oracleExit(
                _tmp,
                oracleBlocksParameters[0]
            );
        } else {
            uint16 revertedIndex = oracleBlocksLength - 1;
            for (uint16 i = 0; i < oracleBlocksLength; i++) {
                // console.log("Oracle response %s", revertedIndex - i);
                IStrategBlock.OracleResponse memory _before = _tmp;
                IStrategBlock.OracleResponse memory _after = IStrategBlock(
                    oracleBlocks[revertedIndex - i]
                ).oracleExit(_before, oracleBlocksParameters[revertedIndex - i]);
                _tmp = _after;
            }
        }

        console.log("Check native token oracle response");
        for (uint i = 0; i < _tmp.tokens.length; i++) {
            console.log("  - Token %s with %s amount", IERC20Metadata(_tmp.tokens[i]).name(), _tmp.tokensAmount[i]);

            if (_tmp.tokens[i] == _asset) {
                console.log("   Native token finded with %s amount", _tmp.tokensAmount[i]);
                tvl += _tmp.tokensAmount[i];
            }
        }

        tvl += IERC20(_asset).balanceOf(address(this));
        console.log("Final TVL with %s amount", tvl);
        console.log("___________________________");
        return tvl;
    }

    function totalAssets() public view virtual override returns (uint256) {
        return _getNativeTVL();
    }

    function _harvestStrategy() private {
        for (uint16 i = 0; i < harvestBlocksLength; i++) {
            (bool success, ) = harvestBlocks[i].delegatecall(
                abi.encodeWithSignature(
                    "enter(bytes)",
                    harvestBlocksParameters[i]
                )
            );

            if (!success) {
                revert(
                    string.concat("Block err harvest: ", Strings.toString(i))
                );
            }
        }
    }

    function _enterInStrategy() private {
        console.log("enter in _enterInStrategy()");
        for (uint16 i = 0; i < stratBlocksLength; i++) {
            (bool success, ) = stratBlocks[i].delegatecall(
                abi.encodeWithSignature("enter(bytes)", stratBlocksParameters[i])
            );

            if (!success) {
                revert(string.concat("Block err enter: ", Strings.toString(i)));
            }
        }
    }

    function _harvestFees() private {
        uint256 tAssets = totalAssets();
        // console.log("tAssets: ", tAssets);
        uint256 tSupply = totalSupply();
        // console.log("tSupply: ", tSupply);
        uint256 _lastFeeHarvestIndex = lastFeeHarvestIndex;
        // console.log("_lastFeeHarvestIndex: ", _lastFeeHarvestIndex);
        uint256 currentVaultIndex = (tAssets * 10000) / tSupply;
        // console.log("currentVaultIndex: ", currentVaultIndex);

        if (
            _lastFeeHarvestIndex == currentVaultIndex ||
            currentVaultIndex < _lastFeeHarvestIndex
        ) {
            lastFeeHarvestIndex = currentVaultIndex;
            return;
        }

        uint256 lastFeeHarvestIndexDiff = currentVaultIndex -
            _lastFeeHarvestIndex;
        // console.log("lastFeeHarvestIndexDiff: ", lastFeeHarvestIndexDiff);
        uint256 nativeTokenFees = (lastFeeHarvestIndexDiff *
            tSupply *
            performanceFees) / (100000000); //

        lastFeeHarvestIndex =
            currentVaultIndex -
            ((lastFeeHarvestIndexDiff * performanceFees) / 10000);
        // console.log("nativeTokenFees: ", nativeTokenFees);
        // console.log("_lastFeeHarvestIndex: ", _lastFeeHarvestIndex);
        IERC20(asset()).transfer(feeCollector, nativeTokenFees);
    }

    function _exitStrategy() private {
        if (stratBlocksLength == 0) return;

        if (oracleBlocksLength == 1) {
            console.log("Only one  Block to check");
            (bool success, ) = stratBlocks[0].delegatecall(
                abi.encodeWithSignature(
                    "exit(bytes)",
                    stratBlocksParameters[0]
                )
            );
            console.log("success: %s", success);
            if (!success) {
                revert(string.concat("Block err exit: 0"));
            }

            return;
        } else {
            console.log("Many Block to check");
            uint16 revertedIndex = stratBlocksLength - 1;
            for (uint16 i = 0; i < stratBlocksLength; i++) {
                console.log("Block %s: ", i);
                (bool success, ) = stratBlocks[revertedIndex - i].delegatecall(
                    abi.encodeWithSignature(
                        "exit(bytes)",
                        stratBlocksParameters[revertedIndex - i]
                    )
                );

                console.log("success: %s", success);
                if (!success) {
                    revert(string.concat("Block err exit: ", Strings.toString(i)));
                }
            }
        }
    }

    function harvest() external {
        _harvestStrategy();
        _exitStrategy();
        _harvestFees();
        _enterInStrategy();
    }

    /** @dev See {IERC4262-deposit}. */
    function deposit(uint256 assets, address receiver)
        public
        virtual
        override
        returns (uint256)
    {
        require(initialized, '!initialized');
        require(
            assets <= maxDeposit(receiver),
            "ERC4626: deposit more than max"
        );

        uint256 shares = previewDeposit(assets);
        _deposit(_msgSender(), receiver, assets, shares);
        _enterInStrategy();

        return shares;
    }

    /** @dev See {IERC4262-mint}. */
    function mint(uint256 shares, address receiver)
        public
        virtual
        override
        returns (uint256)
    {
        require(initialized, '!initialized');
        require(shares <= maxMint(receiver), "ERC4626: mint more than max");

        uint256 assets = previewMint(shares);
        _deposit(_msgSender(), receiver, assets, shares);
        _enterInStrategy();

        return assets;
    }

    /** @dev See {IERC4262-withdraw}. */
    function withdraw(
        uint256 assets,
        address receiver,
        address owner
    ) public virtual override returns (uint256) {
        require(
            assets <= maxWithdraw(owner),
            "ERC4626: withdraw more than max"
        );

        // _harvestStrategy();
        _exitStrategy();
        uint256 shares = previewWithdraw(assets);
        _withdraw(_msgSender(), receiver, owner, assets, shares);

        if (totalAssets() > 0) _enterInStrategy();

        return shares;
    }

    /** @dev See {IERC4262-redeem}. */
    function redeem(
        uint256 shares,
        address receiver,
        address owner
    ) public virtual override returns (uint256) {
        require(shares <= maxRedeem(owner), "ERC4626: redeem more than max");

        // _harvestStrategy();
        _exitStrategy();
        uint256 assets = previewRedeem(shares);
        _withdraw(_msgSender(), receiver, owner, assets, shares);

        if (totalAssets() > 0) _enterInStrategy();

        return assets;
    }
}
