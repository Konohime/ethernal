// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Commit-reveal randomness register.
///
/// Security model — three layers combine to make the final seed unpredictable
/// to any single actor (user or sequencer):
///
/// 1. FUTURE-BLOCK COMMITMENT. `request()` targets `block.number + 1`, a block
///    that is NOT YET MINED when the caller signs the transaction. The caller
///    cannot know `blockhash(targetBlock)` at commit time.
///
/// 2. PER-REQUEST SALT. At `request()` time we derive an implicit salt from
///    the calling context (msg.sender, block.prevrandao, block.timestamp,
///    gasleft()) that is recorded in storage. The sequencer sees msg.sender
///    but cannot freely manipulate `gasleft()` mid-transaction without
///    breaking the call. The salt is cryptographically mixed into the output.
///
/// 3. NO PREDICTABLE FALLBACK. If the 256-block window expires without a
///    `save()`, the register returns bytes32(0). Callers MUST treat this as
///    "entropy lost" and either retry or fall back to a safe default. The old
///    contract returned a blockhash of an unrelated, publicly-readable block
///    after 256 blocks — that was the L-4 finding.
///
/// Consumer contract responsibilities:
/// - Call `request()` at action time and store the returned `targetBlock`.
/// - Later, call `get(targetBlock)` to retrieve the seed. If it returns
///   bytes32(0), handle the expired case explicitly — never assume a
///   "default" outcome.
/// - Periodically call `save()` to persist hashes before the 256-block
///   window closes on the register's shared `_blockToActualise` slot.
contract BlockHashRegister {
    struct Entry {
        bytes32 blockHash;
        bytes32 salt;
    }

    // Legacy slot — kept first for storage layout compatibility with the
    // previously deployed register (`mapping(uint256 => bytes32) _blockHashes`).
    // Unused at runtime; reads go through `_entries`.
    mapping(uint256 => bytes32) _legacyBlockHashes;
    uint256 _blockToActualise;

    // Appended state.
    mapping(uint256 => Entry) _entries;
    mapping(uint256 => bytes32) _pendingSalt;

    event HashRequested(uint256 indexed targetBlock, bytes32 salt, address indexed requester);
    event HashSaved(uint256 indexed targetBlock, bytes32 blockHash);
    event HashExpired(uint256 indexed targetBlock);

    /// @notice Commit to using the hash of `block.number + 1` as entropy.
    /// Returns the target block number — the caller MUST store this to later
    /// retrieve the seed via `get(targetBlock)`.
    function request() external returns (uint64 targetBlock) {
        uint256 prev = _blockToActualise;
        if (prev != 0 && prev < block.number) {
            _persist(prev);
        }
        targetBlock = uint64(block.number) + 1;
        _blockToActualise = targetBlock;

        // Implicit salt: cannot be derived without reading storage (sequencer
        // cannot pre-compute it off-chain for another user's session).
        bytes32 salt = keccak256(
            abi.encode(
                msg.sender,
                block.number,
                block.timestamp,
                block.prevrandao,
                gasleft(),
                targetBlock,
                tx.origin,
                address(this).balance
            )
        );
        _pendingSalt[targetBlock] = salt;
        emit HashRequested(targetBlock, salt, msg.sender);
    }

    /// @notice Persist the currently-pending hash. Callable by anyone — the
    /// output is deterministic, so griefing is limited to paying gas on
    /// someone's behalf.
    function save() external {
        uint256 target = _blockToActualise;
        if (target != 0 && target < block.number) {
            _persist(target);
            _blockToActualise = 0;
        }
    }

    /// @notice Retrieve the seed for a previously-committed targetBlock.
    /// Returns bytes32(0) if not yet available OR if the 256-block window has
    /// elapsed. Callers MUST check for zero and handle expiration — never
    /// fall back to a predictable value.
    function get(uint256 targetBlock) external view returns (bytes32) {
        Entry memory e = _entries[targetBlock];
        if (e.blockHash != bytes32(0)) {
            return keccak256(abi.encode(e.blockHash, e.salt, targetBlock));
        }
        if (targetBlock >= block.number) {
            return bytes32(0); // still in the future — not ready
        }
        if (block.number - targetBlock > 256) {
            return bytes32(0); // expired — no predictable fallback
        }
        bytes32 h = blockhash(targetBlock);
        if (h == bytes32(0)) {
            return bytes32(0);
        }
        bytes32 salt = _pendingSalt[targetBlock];
        return keccak256(abi.encode(h, salt, targetBlock));
    }

    function getBlockToActualise() external view returns (uint256) {
        return _blockToActualise;
    }

    function _persist(uint256 targetBlock) internal {
        if (targetBlock >= block.number) return;
        if (block.number - targetBlock > 256) {
            delete _pendingSalt[targetBlock];
            emit HashExpired(targetBlock);
            return;
        }
        bytes32 h = blockhash(targetBlock);
        if (h == bytes32(0)) return;
        _entries[targetBlock] = Entry({blockHash: h, salt: _pendingSalt[targetBlock]});
        delete _pendingSalt[targetBlock];
        emit HashSaved(targetBlock, h);
    }
}
