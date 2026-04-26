const retry = require('p-retry');
const memoize = require('memoizee');
const taim = require('taim');
const { provider, contracts } = require('./provider');

const zeroHash = '0x0000000000000000000000000000000000000000000000000000000000000000';

// IMPORTANT: do NOT fall back to `provider.getBlock(n).hash`.
// The contract derives its seed via `BlockHashRegister.get(n)` which returns
// `keccak256(blockHash, salt, targetBlock)` — a SALTED hash, never the raw
// block hash. Falling back to the raw hash produces a seed the contract will
// never use, causing the backend to forecast room exits / monsters that
// disagree with on-chain `_actualiseRoom` output. Symptom: client shows a
// discovery arrow toward a direction the contract rejects with
// "cant move this way" because `_rooms[X].exits` doesn't have that bit.
//
// Returning zeroHash here is the correct signal that the seed isn't yet
// available (block too recent, not in register, or 256-block window
// elapsed). Callers MUST treat zeroHash as "not actualisable yet" and not
// fabricate exits — see fetchRoomInfo in game/map.js.
// Only memoize SUCCESSFUL lookups (non-zero hash). zeroHash means "the seed
// isn't in the register yet" — a transient state that flips to a real hash
// once BlockHashRegister.save() runs for that target block. Caching the zero
// pins the room to "not actualisable" / "no monster" forever, even after the
// chain has the seed. Symptom: contract reverts move with "monster blocking"
// while backend keeps reporting hasMonster=false because the cached zeroHash
// short-circuits the monster-index computation in fetchRoomInfo.
const memoizedFetch = memoize(taim('blockHash', async (blockNumber, options = {}) => {
  blockNumber = Number(blockNumber);
  const { BlockHashRegister } = await contracts();
  return retry(async () => {
    const hash = await BlockHashRegister.get(blockNumber, options);
    return hash;
  });
}), { max: 10000, primitive: true, length: false });

const blockHash = async (blockNumber, options = {}) => {
  const hash = await memoizedFetch(blockNumber, options);
  if (!hash || hash === zeroHash) {
    memoizedFetch.delete(Number(blockNumber));
    return zeroHash;
  }
  return hash;
};

module.exports = blockHash;
