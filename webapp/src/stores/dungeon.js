import { writable, derived } from 'svelte/store';

import Dungeon from 'lib/dungeon';
import getDelegateKey from 'lib/delegateKey';
import preDungeonCheck from 'stores/preDungeonCheck';
import wallet from 'stores/wallet';

let lastWalletAddress;
let d;

export const loadDungeon = async $wallet => {
  const delegateAccount = await getDelegateKey($wallet.address);
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

      // (No auto-UBF claim here.) We used to fire claimUBFAsCharacter on dungeon
      // load to top off the player's energy, but the contract reverts with
      // NO_ACTIVITY for fresh sessions and the call popped MetaMask before the
      // player did anything. The contract-side refund in callAsCharacter keeps
      // the burner funded organically; UBF is now claimed only on explicit user
      // action (e.g. when the energy bar runs low).
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
