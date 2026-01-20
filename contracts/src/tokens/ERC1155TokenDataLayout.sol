// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ERC1155TokenDataLayout {
    mapping(address => mapping(uint256 => uint256)) internal _balances; // TODO pack balances into one unit256
    mapping(uint256 => mapping(uint256 => uint256)) internal _subBalances; // TODO pack balances into one unit256
    mapping(address => mapping(address => bool)) internal _operatorsForAll;

    address _tokenOwner; //the dungeon
}
