// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./ERC721Token.sol";

contract Gears is ERC721Token {
    function postUpgrade(address dungeon) public override {
        super.postUpgrade(dungeon);
    }
}
