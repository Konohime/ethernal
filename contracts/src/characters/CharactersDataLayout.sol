// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract CharactersDataLayout {
    uint256 nextId;
    mapping(uint256 => address) _owners;
    mapping(address => uint256) _numPerOwners;
    mapping(uint256 => mapping(address => uint256)) _subOwner;
    mapping(uint256 => mapping(address => uint256)) _data;

    // Roles — appended to preserve upgrade storage layout.
    // _minter: contract allowed to mint characters (Player).
    // _dungeon: contract allowed to mutate in-dungeon state (Diamond holder).
    address _minter;
    address _dungeon;
    mapping(uint256 => address) _approved;
    mapping(address => mapping(address => bool)) _operators;
}
