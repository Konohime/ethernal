// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "hardhat-deploy/solc_0.8/proxy/Proxied.sol";
import "./CharactersDataLayout.sol";

contract Characters is Proxied, CharactersDataLayout {
    event CharacterUpdate(uint256 indexed id, address indexed owner, uint256 data);
    event Transfer(address indexed from, address indexed to, uint256 indexed id);
    event Approval(address indexed owner, address indexed approved, uint256 indexed id);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event RolesUpdated(address indexed minter, address indexed dungeon);

    function postUpgrade() external proxied {
        if (nextId == 0) {
            nextId = 1;
        }
    }

    /// @notice Proxy-admin-only: set the trusted minter (Player) and dungeon (Diamond).
    /// Must be called after first deploy and on any rotation.
    function setRoles(address minter, address dungeon) external onlyProxyAdmin {
        require(minter != address(0) && dungeon != address(0), "ZERO_ADDRESS");
        _minter = minter;
        _dungeon = dungeon;
        emit RolesUpdated(minter, dungeon);
    }

    modifier onlyMinter() {
        // Player mints via createAndEnter; the Diamond mints on resurrection
        // (DungeonCharacterFacet.resurrectFrom). Both are trusted; no other
        // caller may create characters.
        require(msg.sender == _minter || msg.sender == _dungeon, "NOT_MINTER");
        _;
    }

    modifier onlyDungeon() {
        require(msg.sender == _dungeon, "NOT_DUNGEON");
        _;
    }

    function getSubOwner(uint256 id) external view returns (uint256) {
        return _subOwner[id][_owners[id]];
    }

    /// @notice Only the dungeon contract can update in-dungeon sub-ownership.
    /// The previous version allowed the EOA owner to set arbitrary sub-owners,
    /// which combined with free mint and stat writes enabled godmode entry.
    function setSubOwner(uint256 id, uint256 subOwner) external onlyDungeon {
        _setSubOwnerFor(id, _owners[id], subOwner);
    }

    function _setSubOwnerFor(
        uint256 id,
        address owner,
        uint256 subOwner
    ) internal {
        _subOwner[id][owner] = subOwner;
    }

    /// @notice Mint a new character. Restricted to the Player contract.
    /// Players enter the game through Player.createAndEnter which handles
    /// fees and sub-ownership — no legitimate path mints outside that flow.
    function mintTo(address to) external onlyMinter returns (uint256) {
        require(to != address(0), "ZERO_ADDRESS");
        return _mint(to);
    }

    function mint(uint256 subOwner) external onlyMinter returns (uint256) {
        uint256 id = _mint(msg.sender);
        _setSubOwnerFor(id, msg.sender, subOwner);
        return id;
    }

    function _mint(address to) internal returns (uint256) {
        uint256 id = nextId++;
        _owners[id] = to;
        _numPerOwners[to]++;
        emit Transfer(address(0), to, id);
        return id;
    }

    function getData(uint256 id) external view returns (uint256) {
        return _data[id][msg.sender];
    }

    function getDataFor(uint256 id, address owner) external view returns (uint256) {
        return _data[id][owner];
    }

    /// @notice Only the dungeon can set character stats. Previously any EOA
    /// holder could rewrite their own stats (class/level/HP) to maxed values
    /// before entering — full godmode exploit.
    function setData(uint256 id, uint256 data) external onlyDungeon {
        _setDataFor(id, _owners[id], data);
    }

    function _setDataFor(
        uint256 id,
        address owner,
        uint256 data
    ) internal {
        _data[id][owner] = data;
        emit CharacterUpdate(id, owner, data);
    }

    function _ownerOf(uint256 id) internal view returns (address) {
        return _owners[id];
    }

    function fullOwnerOf(uint256 id) external view returns (address owner, uint256 subOwner) {
        owner = _ownerOf(id);
        subOwner = _subOwner[id][owner];
    }

    function ownerOf(uint256 id) external view returns (address tokenOwner) {
        tokenOwner = _ownerOf(id);
        require(tokenOwner != address(0), "token does not exist");
    }

    function balanceOf(address who) external view returns (uint256) {
        require(who != address(0), "zero address");
        return _numPerOwners[who];
    }

    function approve(address approved, uint256 id) external {
        address owner = _owners[id];
        require(
            msg.sender == owner || _operators[owner][msg.sender],
            "NOT_AUTHORIZED_APPROVE"
        );
        _approved[id] = approved;
        emit Approval(owner, approved, id);
    }

    function getApproved(uint256 id) external view returns (address) {
        require(_owners[id] != address(0), "token does not exist");
        return _approved[id];
    }

    function setApprovalForAll(address operator, bool approved) external {
        _operators[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function isApprovedForAll(address owner, address operator) external view returns (bool) {
        return _operators[owner][operator];
    }

    /// @notice ERC-721 transferFrom with proper authorization.
    /// Previously unchecked — anyone could move anyone's character.
    /// Player (the minter) is trusted for enter/exit flows without needing approval.
    function transferFrom(
        address from,
        address to,
        uint256 id
    ) public {
        require(to != address(0), "to is zero address");
        address owner = _owners[id];
        require(owner == from && owner != address(0), "from is not owner");
        require(
            msg.sender == owner
                || msg.sender == _minter
                || msg.sender == _dungeon
                || msg.sender == _approved[id]
                || _operators[owner][msg.sender],
            "NOT_AUTHORIZED_TRANSFER"
        );
        _subOwner[id][owner] = 0;
        _approved[id] = address(0);
        _owners[id] = to;
        _numPerOwners[from]--;
        _numPerOwners[to]++;
        emit Transfer(from, to, id);
    }

    function safeTransferFrom(address from, address to, uint256 id) external {
        transferFrom(from, to, id);
    }

    function safeTransferFrom(address from, address to, uint256 id, bytes calldata) external {
        transferFrom(from, to, id);
    }

    function supportsInterface(bytes4 id) external pure returns (bool) {
        return
            id == 0x01ffc9a7 || // ERC-165
            id == 0x80ac58cd;   // ERC-721
    }
}
