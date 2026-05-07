import { writable, derived } from 'svelte/store';

import { toBeHex } from 'ethers';

import config from 'data/config';
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

      // Auto-claim UBF if available (fire-and-forget, meta-tx via delegate = no wallet popup).
      // Must NOT be awaited here: svelte's `derived` async callback cancels its continuation
      // once `set()` triggers downstream updates, so awaited code after `set(d)` never runs.
      (async () => {
        // First, ensure the delegate burner has enough gas to send a metatx.
        // The metatx UBF claim is itself paid by the delegate, so a delegate
        // that has run dry can never claim — silent lockout. Auto-refill
        // from the main wallet (single signature) when below the threshold.
        try {
          const provider = wallet.getProvider();
          const chainId = $wallet.chainId;
          const minBalance = BigInt(config(chainId).contractMinBalance);
          const delegateBalance = BigInt(
            (await provider.getBalance(d.delegateWallet.address)).toString(),
          );
          if (delegateBalance < minBalance) {
            const mainBalance = BigInt(
              (await provider.getBalance($wallet.address)).toString(),
            );
            // refillAccount auto-tops up the delegate to MIN_BALANCE from
            // the value sent (after fee). Send 2 * MIN_BALANCE so the
            // delegate is refilled AND the player gets a small energy
            // buffer for the next move (which then triggers the on-chain
            // refund loop in callAsCharacter).
            const refillValue = minBalance * 2n;
            const gasPriceFloor = BigInt(config(chainId).gasPrice);
            const feeData = await provider.getFeeData();
            const network = feeData.gasPrice ?? feeData.maxFeePerGas ?? 0n;
            const gasPrice = network > gasPriceFloor ? network : gasPriceFloor;
            const refillTxGasCost = gasPrice * 200000n;
            if (mainBalance >= refillValue + refillTxGasCost) {
              console.log('[auto-refill] topping up delegate from main wallet', {
                delegateBalance: delegateBalance.toString(),
                refillValue: refillValue.toString(),
              });
              const tx = await wallet.tx(
                {
                  gas: toBeHex(BigInt(200000)),
                  gasPrice: toBeHex(gasPrice),
                  value: toBeHex(refillValue),
                },
                'Player',
                'refillAccount',
                $wallet.address,
              );
              await tx.wait();
              console.log('[auto-refill] delegate refilled');
            } else {
              console.warn('[auto-refill] main wallet balance insufficient to refill delegate', {
                delegateBalance: delegateBalance.toString(),
                mainBalance: mainBalance.toString(),
                needed: (refillValue + refillTxGasCost).toString(),
              });
            }
          }
        } catch (e) {
          console.warn('[auto-refill] skipped:', e.reason || e.message || e);
        }

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
