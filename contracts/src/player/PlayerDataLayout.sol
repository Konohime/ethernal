// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

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

    // --- Refill fee (appended at the end to preserve upgradeable storage layout) ---
    address payable _treasury;
    uint16 _refillFeeBps; // basis points, 100 = 1%, hard-capped at 1000 (10%) by the setter

    // --- Reverse delegate lookup, used to auto-top-up the delegate gas balance on refill ---
    // Populated on _addDelegate; existing pre-upgrade delegates can populate via syncDelegate().
    mapping(address => address payable) _delegateOf;

    // --- Onboarding sponsor (appended to preserve upgradeable storage layout) ---
    // _onboardingPool is the dedicated reserve fed by fundOnboarding(). When empty,
    // grants fall through to UBF (Pool) balance. _onboarded[sender] guarantees one
    // grant per main wallet; _maxDailyGrants caps global daily spend so a sybil
    // attacker can drain at most that many grants per UTC day.
    uint256 _onboardingPool;
    uint256 _onboardingGrant;
    uint32 _maxDailyGrants;
    uint32 _dailyGrantsUsed;
    uint64 _dailyGrantsDay;
    mapping(address => bool) _onboarded;

    // --- Configurable UBF fee multiplier (appended to preserve upgradeable storage layout) ---
    // callAsCharacter computes poolFee = txCharge * _poolFeeMultiplier. A stored
    // value of 0 is a sentinel meaning "use DEFAULT_POOL_FEE_MULTIPLIER", so a
    // proxy upgrade that leaves this slot zero keeps the intended default with
    // no migration step. Tunable by the proxy admin via setPoolFeeMultiplier.
    uint256 _poolFeeMultiplier;
}
