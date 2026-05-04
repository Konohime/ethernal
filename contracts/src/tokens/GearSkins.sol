// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Skin pricing & treasury for Gears, kept in diamond storage so that
/// adding this mixin to the upgradeable Gears contract cannot shift its
/// existing storage layout.
abstract contract GearSkins {
    // keccak256("ethernal.gearskins.v1")
    bytes32 internal constant GEARSKINS_STORAGE_SLOT =
        0x9c6a4f3e8d2b1d4f7e3a6c1b8e2d7a4f1c3b6e9d2a5c8f1e4b7a3d6c9f2e5b80;

    struct GearSkinsStorage {
        address payable treasury;
        mapping(uint32 => uint128) priceWei; // priceWei[skinId] = price; 0 means free/disabled
    }

    event SkinTreasuryUpdated(address indexed treasury);
    event SkinPriceUpdated(uint32 indexed skinId, uint128 priceWei);
    event SkinApplied(uint256 indexed gearId, uint32 indexed skinId, address indexed payer, uint256 paid);

    function _gsStorage() private pure returns (GearSkinsStorage storage gs) {
        bytes32 slot = GEARSKINS_STORAGE_SLOT;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            gs.slot := slot
        }
    }

    function _setSkinTreasury(address payable treasury) internal {
        _gsStorage().treasury = treasury;
        emit SkinTreasuryUpdated(treasury);
    }

    function _setSkinPrice(uint32 skinId, uint128 priceWei) internal {
        _gsStorage().priceWei[skinId] = priceWei;
        emit SkinPriceUpdated(skinId, priceWei);
    }

    function getSkinTreasury() external view returns (address) {
        return _gsStorage().treasury;
    }

    function getSkinPrice(uint32 skinId) external view returns (uint128) {
        return _gsStorage().priceWei[skinId];
    }

    /// @dev Reverts if the skin is not for sale (price == 0) or if msg.value is wrong.
    /// Does NOT touch gear data — caller must update gear storage separately
    /// (this keeps payment logic decoupled from token logic).
    function _payForSkin(uint256 gearId, uint32 skinId) internal {
        require(skinId != 0, "skinId 0 reserved");
        GearSkinsStorage storage gs = _gsStorage();
        uint256 price = uint256(gs.priceWei[skinId]);
        require(price > 0, "skin not for sale");
        require(msg.value == price, "wrong value");
        address payable treasury = gs.treasury;
        require(treasury != address(0), "treasury unset");
        // Effects done; interaction last (CEI).
        (bool ok, ) = treasury.call{value: price}("");
        require(ok, "treasury transfer failed");
        emit SkinApplied(gearId, skinId, msg.sender, price);
    }
}
