// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../characters/Characters.sol";
import "./Pool.sol";

interface Enterable {
    // TODO generalize?
    function enter(
        address sender,
        uint256 characterId,
        string calldata data,
        uint8 class,
        uint256 location
    ) external payable;
}

contract PlayerDataLayout {
    uint256 internal MIN_BALANCE; // = 5000000000000000;

    struct PlayerStruct {
        uint128 energy;
        uint128 freeEnergy;
    }

    address payable _feeRecipient;
    mapping(address => address) _delegates;
    mapping(address => PlayerStruct) _players;
    mapping(address => uint256) _lastCharacterIds;

    Characters _charactersContract;
    Enterable _holder;

    Pool _pool;
}
