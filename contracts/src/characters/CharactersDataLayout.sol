// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract CharactersDataLayout {
    uint256 nextId;
    mapping(uint256 => address) _owners;
    mapping(address => uint256) _numPerOwners;
    mapping(uint256 => mapping(address => uint256)) _subOwner;
    mapping(uint256 => mapping(address => uint256)) _data;
}
