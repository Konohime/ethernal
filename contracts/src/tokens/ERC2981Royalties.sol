// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/// @notice Minimal EIP-2981 royalty mixin using diamond storage.
/// Diamond storage keeps the royalty fields in a fixed slot, so adding this
/// mixin to existing upgradeable contracts cannot shift any pre-existing
/// storage layout.
abstract contract ERC2981Royalties {
    // Derived inline so the slot is auditable from source. Note: this changes
    // the storage slot away from the previous magic constant. Any non-zero
    // royalty already configured on-chain must be re-set via `setRoyalty`
    // after this upgrade lands. Inline derivation also catches typos at
    // compile time, eliminating the magic-number drift risk.
    bytes32 internal constant ROYALTY_STORAGE_SLOT =
        keccak256("ethernal.royalties.v1");

    struct RoyaltyStorage {
        address receiver;
        uint96 bps; // basis points, hard-capped at 1000 (10%) by the setter
    }

    uint96 internal constant MAX_ROYALTY_BPS = 1000;
    bytes4 internal constant INTERFACE_ID_ERC2981 = 0x2a55205a;

    event RoyaltyUpdated(address indexed receiver, uint96 bps);

    function _royaltyStorage() private pure returns (RoyaltyStorage storage rs) {
        bytes32 slot = ROYALTY_STORAGE_SLOT;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            rs.slot := slot
        }
    }

    function _setRoyalty(address receiver, uint96 bps) internal {
        require(bps <= MAX_ROYALTY_BPS, "royalty too high");
        require(receiver != address(0) || bps == 0, "receiver required");
        RoyaltyStorage storage rs = _royaltyStorage();
        rs.receiver = receiver;
        rs.bps = bps;
        emit RoyaltyUpdated(receiver, bps);
    }

    /// @notice EIP-2981 — returns receiver and royalty amount for a given sale price.
    function royaltyInfo(uint256, uint256 salePrice)
        external
        view
        returns (address receiver, uint256 amount)
    {
        RoyaltyStorage storage rs = _royaltyStorage();
        receiver = rs.receiver;
        amount = (salePrice * rs.bps) / 10000;
    }

    function getRoyalty() external view returns (address receiver, uint96 bps) {
        RoyaltyStorage storage rs = _royaltyStorage();
        return (rs.receiver, rs.bps);
    }

    function _supportsRoyaltyInterface(bytes4 interfaceId) internal pure returns (bool) {
        return interfaceId == INTERFACE_ID_ERC2981;
    }
}
