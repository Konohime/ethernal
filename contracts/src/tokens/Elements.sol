// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./ERC1155Token.sol";

contract Elements is ERC1155Token {
    function postUpgrade(address dungeon) public override {
        super.postUpgrade(dungeon);
    }
}
