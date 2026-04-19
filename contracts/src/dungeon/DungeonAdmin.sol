// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./DungeonAdminFacet.sol";

/// @notice Backend relay. A deployer-owned key ("owner") holds configuration
/// authority; a separate hot key ("backend") signs gameplay transactions.
/// The backend cannot rotate itself — a hot-wallet compromise can be recovered
/// by the owner without losing the dungeon pointer.
contract DungeonAdmin {
    struct MonsterReward {
        uint256 characterId;
        int16 hpChange;
        uint16 xpGained;
        uint256 gear;
        int64 durabilityChange;
        int16[8] balanceChange;
        uint16[8] bounty;
    }

    DungeonAdminFacet _dungeon;
    address _backendAddress;
    address _owner;
    address _pendingBackend;

    event OwnerTransferred(address indexed previousOwner, address indexed newOwner);
    event BackendNominated(address indexed nominee);
    event BackendRotated(address indexed previousBackend, address indexed newBackend);
    event DungeonSet(address indexed dungeon);

    constructor(address backendAddress) {
        require(backendAddress != address(0), "ZERO_BACKEND");
        _backendAddress = backendAddress;
        _owner = msg.sender;
        emit OwnerTransferred(address(0), msg.sender);
        emit BackendRotated(address(0), backendAddress);
    }

    modifier onlyBackend() {
        require(msg.sender == _backendAddress, "NOT_AUTHORIZED_BACKEND");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == _owner, "NOT_AUTHORIZED_OWNER");
        _;
    }

    function owner() external view returns (address) {
        return _owner;
    }

    function pendingBackend() external view returns (address) {
        return _pendingBackend;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "ZERO_OWNER");
        address prev = _owner;
        _owner = newOwner;
        emit OwnerTransferred(prev, newOwner);
    }

    function setDungeon(DungeonAdminFacet dungeon) external onlyOwner {
        require(address(dungeon) != address(0), "ZERO_DUNGEON");
        _dungeon = dungeon;
        emit DungeonSet(address(dungeon));
    }

    /// @notice Two-step backend rotation. Owner nominates, nominee accepts.
    /// Prevents typos locking the system out and removes any self-rotation power
    /// from a compromised backend key.
    function nominateBackend(address nominee) external onlyOwner {
        require(nominee != address(0), "ZERO_BACKEND");
        _pendingBackend = nominee;
        emit BackendNominated(nominee);
    }

    function acceptBackend() external {
        require(msg.sender == _pendingBackend, "NOT_NOMINATED");
        address prev = _backendAddress;
        _backendAddress = _pendingBackend;
        _pendingBackend = address(0);
        emit BackendRotated(prev, msg.sender);
    }

    function getDungeonAndBackendAddress() external view returns (DungeonAdminFacet dungeon, address backendAddress) {
        dungeon = _dungeon;
        backendAddress = _backendAddress;
    }

    function forward(address to, bytes memory data) public onlyBackend returns (bool success) {
        return _dungeon.forward(to, data);
    }

    function teleportCharacter(uint256 characterId, uint256 location) external onlyBackend {
        _dungeon.teleportCharacter(characterId, location);
    }

    function updateCharacter(
        uint256 characterId,
        uint256 monsterId,
        int16 hpChange,
        uint16 xpGained,
        uint256 gear,
        int64 durabilityChange,
        int16[8] calldata balanceChange
    ) external onlyBackend {
        _dungeon.updateCharacter(characterId, monsterId, hpChange, xpGained, gear, durabilityChange, balanceChange);
    }

    function monsterDefeated(
        uint256 location,
        uint256 monsterId,
        MonsterReward[] calldata rewards
    ) external onlyBackend {
        _dungeon.monsterDefeated(location);
        for (uint256 i = 0; i < rewards.length; i++) {
            _dungeon.updateCharacter(
                rewards[i].characterId,
                monsterId,
                rewards[i].hpChange,
                rewards[i].xpGained,
                rewards[i].gear,
                rewards[i].durabilityChange,
                rewards[i].balanceChange
            );
            _dungeon.claimBounty(location, rewards[i].characterId, rewards[i].bounty);
        }
    }

    function generateRoomIncome(uint256 location, address benefactor, uint16[8] calldata income) external onlyBackend {
        _dungeon.generateRoomIncome(location, benefactor, income);
    }

    function characterDefeated(uint256 characterId, uint256 monsterId) external onlyBackend {
        _dungeon.characterDefeated(characterId, monsterId);
    }

    function characterEscaped(
        uint256 characterId,
        uint256 monsterId,
        int16 hpChange,
        int16 /*elemChange*/
    ) external onlyBackend {
        _dungeon.characterEscaped(characterId, monsterId, hpChange);
    }

    function updateQuest(uint256 character, uint64 id, uint8 status, string calldata data) external onlyBackend {
        _dungeon.updateQuest(character, id, status, data);
    }

    function updateRoomData(uint256 character, uint256 location, uint256 data, uint256[8] calldata amountsPayed) external onlyBackend {
        _dungeon.updateRoomData(character, location, data, amountsPayed);
    }
}
