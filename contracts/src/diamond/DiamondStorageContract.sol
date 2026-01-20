// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title DiamondStorageContract
 * @dev Base contract for Diamond Standard (EIP-2535) storage pattern
 * This is a recreation of the buidler-deploy DiamondStorageContract for Solidity 0.8+
 */
abstract contract DiamondStorageContract {
    
    struct DiamondStorage {
        // Owner of the contract
        address contractOwner;
        // maps function selectors to the facets that execute the functions
        // and maps the selectors to their position in the selectorSlots array
        mapping(bytes4 => bytes32) facets;
        // array of slots of function selectors
        // each slot holds 8 function selectors
        mapping(uint256 => bytes32) selectorSlots;
        // The number of function selectors in selectorSlots
        uint16 selectorCount;
        // Used to query if a contract implements an interface
        // Used to implement ERC-165
        mapping(bytes4 => bool) supportedInterfaces;
    }

    // Storage position for DiamondStorage
    // keccak256("diamond.standard.diamond.storage")
    bytes32 constant DIAMOND_STORAGE_POSITION = 0xc8fcad8db84d3cc18b4c41d551ea0ee66dd599cde068d998e57d5e09332c131c;

    /**
     * @dev Returns the DiamondStorage struct at the defined storage position
     */
    function diamondStorage() internal pure returns (DiamondStorage storage ds) {
        bytes32 position = DIAMOND_STORAGE_POSITION;
        assembly {
            ds.slot := position
        }
    }
}
