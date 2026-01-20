// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract DiamondInit {
    // Storage position for DiamondStorage (same as DiamondStorageContract)
    bytes32 constant DIAMOND_STORAGE_POSITION = 0xc8fcad8db84d3cc18b4c41d551ea0ee66dd599cde068d998e57d5e09332c131c;

    struct DiamondStorage {
        address contractOwner;
        mapping(bytes4 => bytes32) facets;
        mapping(uint256 => bytes32) selectorSlots;
        uint16 selectorCount;
        mapping(bytes4 => bool) supportedInterfaces;
    }

    function diamondStorage() internal pure returns (DiamondStorage storage ds) {
        bytes32 position = DIAMOND_STORAGE_POSITION;
        assembly {
            ds.slot := position
        }
    }

    /// @notice Initialise le contractOwner dans le DiamondStorage
    /// @param _owner L'adresse du owner
    function init(address _owner) external {
        DiamondStorage storage ds = diamondStorage();
        ds.contractOwner = _owner;
    }
}
