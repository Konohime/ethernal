// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Player.sol";
import "../characters/Characters.sol";

contract UBFDataLayout {
    Player _playerContract;
    Characters _charactersContract;
    mapping(address => mapping(uint256 => uint256)) _timeSlots;
    mapping(address => mapping(uint256 => bool)) _claimedSlots;
}
