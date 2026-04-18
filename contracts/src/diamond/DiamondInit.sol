// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./DiamondStorageContract.sol";

/**
 * @dev Repair initializer — sets contractOwner at the correct storage slot
 * (LibDiamond layout, slot 4). Called via diamondCut by scripts/fix-diamond-owner.js.
 */
contract DiamondInit is DiamondStorageContract {
    function init(address _owner) external {
        DiamondStorage storage ds = diamondStorage();
        ds.contractOwner = _owner;
    }
}
