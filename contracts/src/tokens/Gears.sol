// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "./ERC721Token.sol";
import "./ERC2981Royalties.sol";
import "./GearSkins.sol";

contract Gears is ERC721Token, ERC2981Royalties, GearSkins {
    function postUpgrade(address dungeon) public override {
        super.postUpgrade(dungeon);
    }

    // --- Royalties (EIP-2981) ---
    function setRoyalty(address receiver, uint96 bps) external onlyProxyAdmin {
        _setRoyalty(receiver, bps);
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x01ffc9a7 /* ERC-165 */
            || _supportsRoyaltyInterface(interfaceId);
    }

    // --- Skins (admin) ---
    function setSkinTreasury(address payable treasury) external onlyProxyAdmin {
        _setSkinTreasury(treasury);
    }

    function setSkinPrice(uint32 skinId, uint128 priceWei) external onlyProxyAdmin {
        _setSkinPrice(skinId, priceWei);
    }

    // --- Skins (player) ---
    /// @notice Apply a skin to a gear. Requires the caller to be the ERC-721
    /// owner or an approved operator. Pays the catalog price to the treasury.
    /// The skin is encoded into the gear data at bits [160..192], preserving
    /// every other field. Skin ID 0 is reserved as "default".
    ///
    /// NOTE: While a gear is held inside the Dungeon vault, the ERC-721 owner
    /// is the Dungeon contract. To let players apply skins on vaulted gears,
    /// add a Dungeon facet that (a) verifies sub-ownership of the character
    /// and gear, then (b) calls this function as an approved operator.
    function applySkin(uint256 gearId, uint32 skinId) external payable {
        address owner = _owners[gearId];
        require(owner != address(0), "gear does not exist");
        require(
            owner == msg.sender || _operatorsForAll[owner][msg.sender],
            "NOT_AUTHORIZED_SKIN"
        );

        _payForSkin(gearId, skinId);

        // Update gear data: clear bits [160..192] and stamp skinId.
        uint256 data = _data[gearId];
        uint256 mask = uint256(0xFFFFFFFF) << 160;
        data = (data & ~mask) | (uint256(skinId) << 160);
        _data[gearId] = data;
        emit DataUpdate(gearId, data);
    }
}
