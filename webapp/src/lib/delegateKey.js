import * as ethers from 'ethers';

import wallet from 'stores/wallet';

// Storage layout:
//   v2 (encrypted): localStorage[`delegateV2:${address}`] = JSON({ iv, ct })
//   v1 (legacy plaintext): localStorage[address] = JSON({ key })
// On first access we migrate v1 → v2 transparently.
//
// The encryption key is derived per-session from a deterministic signature
// the user produces on a fixed message. The signature itself is NOT stored;
// only the AES-GCM key derived from it is held in memory until reload.
// This means an XSS payload can no longer simply read the private key from
// localStorage — it would need to also trick the user into signing the
// derive-key message with their main wallet, a much higher bar.
const SIGN_MESSAGE = 'Ethernal: derive delegate-encryption key v1';

const cache = {}; // { [address]: { aesKey, privateKey, address } }

const dec2hex = dec => `0${dec.toString(16)}`.substr(-2);

const generateRandomKey = () => {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return `0x${Array.from(arr, dec2hex).join('')}`;
};

const toBytes = hex => {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
};

const toHex = bytes => `0x${Array.from(bytes, dec2hex).join('')}`;

const b64encode = bytes => btoa(String.fromCharCode(...bytes));
const b64decode = str => Uint8Array.from(atob(str), c => c.charCodeAt(0));

const importAesKey = async signatureHex => {
  const sigBytes = toBytes(signatureHex);
  const digest = await crypto.subtle.digest('SHA-256', sigBytes);
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
};

const encryptKey = async (aesKey, privateKey) => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const pt = toBytes(privateKey);
  const ctBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, pt);
  return { iv: b64encode(iv), ct: b64encode(new Uint8Array(ctBuf)) };
};

const decryptKey = async (aesKey, blob) => {
  const iv = b64decode(blob.iv);
  const ct = b64decode(blob.ct);
  const ptBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ct);
  return toHex(new Uint8Array(ptBuf));
};

const requestSignature = async () => {
  // Prefer the connected ethers signer; fall back to the raw EIP-1193 provider.
  const signer = wallet.getSigner && wallet.getSigner();
  if (signer && signer.signMessage) {
    return signer.signMessage(SIGN_MESSAGE);
  }
  if (typeof window !== 'undefined' && window.ethereum) {
    const accounts = await window.ethereum.request({ method: 'eth_accounts' });
    return window.ethereum.request({
      method: 'personal_sign',
      params: [SIGN_MESSAGE, accounts[0]],
    });
  }
  throw new Error('no wallet available to derive delegate-encryption key');
};

const delegateKey = async player => {
  if (cache[player]) {
    return { address: cache[player].address, privateKey: cache[player].privateKey };
  }

  const v2Key = `delegateV2:${player}`;
  const legacyKey = player;

  let aesKey;
  let privateKey;

  const v2Raw = localStorage.getItem(v2Key);
  const legacyRaw = localStorage.getItem(legacyKey);

  if (v2Raw) {
    const blob = JSON.parse(v2Raw);
    const sig = await requestSignature();
    aesKey = await importAesKey(sig);
    privateKey = await decryptKey(aesKey, blob);
  } else if (legacyRaw) {
    // Migration: legacy plaintext → v2 encrypted, then wipe legacy.
    const data = JSON.parse(legacyRaw);
    privateKey = data.key;
    const sig = await requestSignature();
    aesKey = await importAesKey(sig);
    const blob = await encryptKey(aesKey, privateKey);
    try {
      localStorage.setItem(v2Key, JSON.stringify(blob));
      localStorage.removeItem(legacyKey);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('could not migrate delegate key to encrypted storage', err);
    }
  } else {
    // First-time setup: generate, encrypt, store.
    privateKey = generateRandomKey();
    const sig = await requestSignature();
    aesKey = await importAesKey(sig);
    const blob = await encryptKey(aesKey, privateKey);
    try {
      localStorage.setItem(v2Key, JSON.stringify(blob));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('could not save delegate key to storage', err);
    }
  }

  const address = new ethers.Wallet(privateKey).address;
  cache[player] = { aesKey, privateKey, address };
  return { address, privateKey };
};

export default delegateKey;
