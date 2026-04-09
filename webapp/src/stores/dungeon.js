import { writable, derived } from 'svelte/store';

import Dungeon from 'lib/dungeon';
import getDelegateKey from 'lib/delegateKey';
import preDungeonCheck from 'stores/preDungeonCheck';
import wallet from 'stores/wallet';

let lastWalletAddress;
let d;

export const loadDungeon = async $wallet => {
  const delegateAccount = getDelegateKey($wallet.address);
  const key = delegateAccount.privateKey;
  const player = $wallet.address.toLowerCase();
  
  const provider = wallet.getProvider();
  console.log('Provider:', provider);
  
  const dungeon = new Dungeon({
    ethersProvider: provider,
    wallet,
    contract: wallet.getContract('Dungeon'),
    playerContract: wallet.getContract('Player'),
    transferer: wallet.getContract('DungeonTokenTransferer'),
    ubf: wallet.getContract('UBF'),
  });
  await dungeon.init(player, key, wallet);
  return dungeon;
};

export const dungeon = derived([wallet, preDungeonCheck], async ([$wallet, $preDungeonCheck], set) => {
  if (
    $wallet.status === 'Ready' &&
    $preDungeonCheck.status === 'Done' &&
    $preDungeonCheck.isCharacterInDungeon &&
    $preDungeonCheck.isDelegateReady
  ) {
    if (lastWalletAddress !== $wallet.address) {
      lastWalletAddress = $wallet.address;
      set('loading');
      d = await loadDungeon($wallet);
      set(d);

      // Auto-claim UBF if available (fire-and-forget, meta-tx via delegate = no wallet popup).
      // Must NOT be awaited here: svelte's `derived` async callback cancels its continuation
      // once `set()` triggers downstream updates, so awaited code after `set(d)` never runs.
      (async () => {
        try {
          console.log('[auto-ubf] checking UBF claim availability...');
          const info = await d.ubfInfo();
          const amount = info.amount ?? info[0];
          const claimed = info.claimed ?? info[3];
          console.log('[auto-ubf] ubfInfo', { amount: amount?.toString(), claimed });
          if (amount && BigInt(amount) > 0n && !claimed) {
            console.log('[auto-ubf] claiming...');
            await d.claimUbf();
            console.log('[auto-ubf] claimed successfully');
          } else {
            console.log('[auto-ubf] nothing to claim');
          }
        } catch (e) {
          console.warn('[auto-ubf] skipped:', e.reason || e.message || e);
        }
      })();
    }
  } else {
    lastWalletAddress = null;
    if (d) {
      d = null;
    }
    set(null);
  }

  // @TODO: remove debug
  window.dungeon = d;
});

export const reading = writable(false);

export const map = writable(null);
