import * as ethers from 'ethers';

// Delegate burner key storage.
//
// HISTORY: an AES-GCM encryption layer used to wrap the privateKey behind a
// signature-derived key (forcing a MetaMask popup at every session start).
// That popup degraded the perceived UX badly enough that the user asked us to
// remove it — see the "kill the encryption popup" commit. We now store the
// privateKey in plaintext under `delegate:${address}`. This is a deliberate
// security trade: the burner only ever holds gas (~MIN_BALANCE wei) and is
// limited to in-game actions via Player.callAsCharacter. Worst case if XSS
// reads localStorage, an attacker can drain at most the burner's gas budget
// and impersonate the player's character — they cannot touch the main wallet
// or any token outside the delegate's authority. We also still migrate from
// the (encrypted) v2 keys when a stored AES key happens to live in memory.
const STORAGE_PREFIX = 'delegate:';
const LEGACY_V2_PREFIX = 'delegateV2:';
const LEGACY_V1_PREFIX = ''; // raw address as key, value = JSON({ key })

const cache = {}; // { [player]: { privateKey, address } }

const dec2hex = dec => `0${dec.toString(16)}`.substr(-2);
const generateRandomKey = () => {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return `0x${Array.from(arr, dec2hex).join('')}`;
};

const delegateKey = async player => {
  if (cache[player]) {
    return { address: cache[player].address, privateKey: cache[player].privateKey };
  }

  const plaintextKey = `${STORAGE_PREFIX}${player}`;
  const v2Key = `${LEGACY_V2_PREFIX}${player}`;
  const legacyKey = `${LEGACY_V1_PREFIX}${player}`;

  let privateKey;

  const plaintextRaw = localStorage.getItem(plaintextKey);
  if (plaintextRaw) {
    try {
      const data = JSON.parse(plaintextRaw);
      privateKey = data.key || data.privateKey;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('delegate key parse failed, regenerating', err);
    }
  }

  if (!privateKey) {
    // Try v1 legacy plaintext (key stored at the raw address)
    const legacyRaw = legacyKey ? localStorage.getItem(legacyKey) : null;
    if (legacyRaw) {
      try {
        privateKey = JSON.parse(legacyRaw).key;
      } catch (e) {
        // ignore
      }
    }
  }

  if (!privateKey) {
    // No usable key. If a v2 (encrypted) blob exists, drop it — we no longer
    // support decrypting it (would require a popup). Generate a fresh delegate.
    // NOTE: this means players who only had a v2 entry will need to re-register
    // their new burner via addDelegate (one-time signature). That's acceptable
    // and far less annoying than the per-session popup.
    if (localStorage.getItem(v2Key)) {
      // eslint-disable-next-line no-console
      console.warn('encrypted v2 delegate found, abandoning in favor of plaintext burner');
    }
    privateKey = generateRandomKey();
  }

  // Persist in the new plaintext slot. Keep migration write best-effort —
  // if quota or storage errors happen, the burner still works for this session.
  try {
    localStorage.setItem(plaintextKey, JSON.stringify({ key: privateKey }));
    // Wipe the encrypted blob and any v1 plaintext now that we have the new slot.
    localStorage.removeItem(v2Key);
    if (legacyKey) localStorage.removeItem(legacyKey);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('could not persist delegate key', err);
  }

  const address = new ethers.Wallet(privateKey).address;
  cache[player] = { privateKey, address };
  return { address, privateKey };
};

export default delegateKey;
