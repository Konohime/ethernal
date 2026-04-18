// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @dev Layout MUST mirror hardhat-deploy LibDiamond — hardhat-deploy writes
 * contractOwner at struct slot 4. Any divergence makes onlyOwner read the
 * wrong slot and reject every call.
 * Reference: node_modules/hardhat-deploy/solc_0.8/diamond/libraries/LibDiamond.sol
 */
abstract contract DiamondStorageContract {

    struct FacetAddressAndPosition {
        address facetAddress;
        uint96 functionSelectorPosition;
    }

    struct FacetFunctionSelectors {
        bytes4[] functionSelectors;
        uint256 facetAddressPosition;
    }

    struct DiamondStorage {
        mapping(bytes4 => FacetAddressAndPosition) selectorToFacetAndPosition;
        mapping(address => FacetFunctionSelectors) facetFunctionSelectors;
        address[] facetAddresses;
        mapping(bytes4 => bool) supportedInterfaces;
        address contractOwner;
    }

    // keccak256("diamond.standard.diamond.storage")
    bytes32 constant DIAMOND_STORAGE_POSITION = 0xc8fcad8db84d3cc18b4c41d551ea0ee66dd599cde068d998e57d5e09332c131c;

    function diamondStorage() internal pure returns (DiamondStorage storage ds) {
        bytes32 position = DIAMOND_STORAGE_POSITION;
        assembly {
            ds.slot := position
        }
    }
}
