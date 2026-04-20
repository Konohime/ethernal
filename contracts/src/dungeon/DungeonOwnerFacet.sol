// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./DungeonFacetBase.sol";
import "./PureDungeon.sol";
import "../utils/BlockHashRegister.sol";
import "../characters/Characters.sol";
import "../tokens/Elements.sol";
import "../tokens/Gears.sol";
import "../player/Player.sol";

contract DungeonOwnerFacet is DungeonFacetBase {
    function postUpgrade(
        address blockHashRegister,
        Player playerContract,
        address payable owner,
        address adminContract
    ) external onlyOwner {
        _playerContract = playerContract;
        playerContract.register();
        _blockHashRegister = BlockHashRegister(blockHashRegister);
        _adminContract = adminContract;
    }

    function setAllowedForwardTarget(address target, bool allowed) external onlyOwner {
        _allowedForwardTargets[target] = allowed;
    }

    /// @notice Whitelist a specific function selector on an allowed forward target.
    /// Selector-level gating prevents a compromised target whitelist from granting
    /// arbitrary calls — operators must opt in to each selector explicitly.
    function setAllowedForwardSelector(address target, bytes4 selector, bool allowed) external onlyOwner {
        _allowedForwardSelectors[target][selector] = allowed;
    }

    function mintElements(uint256 characterId, uint256 elementId, uint256 amount) external onlyOwner {
        _elementsContract.mint(characterId, elementId, amount);
    }

    function start(
        Characters characters,
        Elements elements,
        Gears gears,
        Rooms rooms
    ) external onlyOwner {
        _charactersContract = characters;
        _elementsContract = elements;
        _gearsContract = gears;
        _roomsContract = rooms;
        Room storage room = _rooms[PureDungeon.LOCATION_ZERO];
        require(room.kind == 0, "dungeon already started");
        _discoverRoom(PureDungeon.LOCATION_ZERO, 0, PureDungeon.DOWN);
    }
}
