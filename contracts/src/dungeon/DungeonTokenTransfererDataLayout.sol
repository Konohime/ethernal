// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./DungeonInfoFacet.sol";
import "../tokens/Elements.sol";
import "../tokens/Gears.sol";
import "../player/Player.sol";
import "../characters/Characters.sol";

contract DungeonTokenTransfererDataLayout {
    Gears _gears;
    Elements _elements;
    DungeonInfoFacet _dungeon;
    Player _player;
    Characters _characters;
}
